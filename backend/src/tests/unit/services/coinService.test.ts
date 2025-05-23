import { ERROR_MESSAGES } from '../../../constants';
import { mockCoinRepository } from '../../mocks/repositories';

// Define variables to hold the mocked repositories
let coinRepository: any;
let redisClient: any;
let logger: any;

// Mock the repositories
jest.mock('../../../db/repositories', () => ({
  coinRepository: mockCoinRepository
}));

// Mock Redis client
jest.mock('../../../utils/redisClient', () => {
  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
  };

  return {
    redisClient: mockRedisClient,
    redisGet: jest.fn().mockImplementation(async (key) => mockRedisClient.get(key)),
    redisSet: jest.fn().mockImplementation(async (key, value, ttl) => mockRedisClient.set(key, value, ttl)),
    redisDel: jest.fn().mockImplementation(async (key) => mockRedisClient.del(key)),
    __esModule: true,
    default: mockRedisClient
  };
});

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Import after mocks to avoid circular dependency
import coinService from '../../../services/coinService';

describe('Coin Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up the mocked repositories and utilities
    coinRepository = mockCoinRepository;
    redisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    };
    logger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };
  });

  describe('getAllCoins', () => {
    it('should return coins from cache if available', async () => {
      const mockCoins = [{ id: '1', name: 'TestCoin' }];
      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(mockCoins));

      const result = await coinService.getAllCoins(1, 10);

      expect(redisClient.get).toHaveBeenCalledWith('coins:all:1:10');
      expect(coinRepository.findAll).not.toHaveBeenCalled();
      expect(result).toEqual(mockCoins);
    });

    it('should fetch coins from repository if not in cache', async () => {
      const mockCoins = [{ id: '1', name: 'TestCoin' }];
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (coinRepository.findAll as jest.Mock).mockResolvedValue(mockCoins);

      const result = await coinService.getAllCoins(1, 10);

      expect(redisClient.get).toHaveBeenCalledWith('coins:all:1:10');
      expect(coinRepository.findAll).toHaveBeenCalledWith(1, 10);
      expect(redisClient.set).toHaveBeenCalledWith(
        'coins:all:1:10',
        JSON.stringify(mockCoins),
        'EX',
        expect.any(Number)
      );
      expect(result).toEqual(mockCoins);
    });

    it('should handle errors', async () => {
      const error = new Error('Test error');
      (redisClient.get as jest.Mock).mockRejectedValue(error);

      await expect(coinService.getAllCoins(1, 10)).rejects.toThrow(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getCoinById', () => {
    it('should return coin from cache if available', async () => {
      const mockCoin = { id: '1', name: 'TestCoin' };
      (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(mockCoin));

      const result = await coinService.getCoinById('1');

      expect(redisClient.get).toHaveBeenCalledWith('coins:id:1');
      expect(coinRepository.findById).not.toHaveBeenCalled();
      expect(result).toEqual(mockCoin);
    });

    it('should fetch coin from repository if not in cache', async () => {
      const mockCoin = { id: '1', name: 'TestCoin' };
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (coinRepository.findById as jest.Mock).mockResolvedValue(mockCoin);

      const result = await coinService.getCoinById('1');

      expect(redisClient.get).toHaveBeenCalledWith('coins:id:1');
      expect(coinRepository.findById).toHaveBeenCalledWith('1');
      expect(redisClient.set).toHaveBeenCalledWith(
        'coins:id:1',
        JSON.stringify(mockCoin),
        'EX',
        expect.any(Number)
      );
      expect(result).toEqual(mockCoin);
    });

    it('should throw error if coin not found', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (coinRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(coinService.getCoinById('nonexistent')).rejects.toThrow(ERROR_MESSAGES.COIN_NOT_FOUND);
    });

    it('should handle errors', async () => {
      const error = new Error('Test error');
      (redisClient.get as jest.Mock).mockRejectedValue(error);

      await expect(coinService.getCoinById('1')).rejects.toThrow(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('createCoin', () => {
    it('should create a new coin', async () => {
      const mockCoinData = {
        name: 'NewCoin',
        symbol: 'NC',
        objectId: 'obj123',
        creatorAddress: '0x123',
        supply: '1000000',
        price: 0.001,
        marketCap: '1000',
        volume24h: '100',
        priceChange24h: '5',
        holders: 10
      };
      const mockCreatedCoin = { id: '1', ...mockCoinData };

      (coinRepository.findByObjectId as jest.Mock).mockResolvedValue(null);
      (coinRepository.create as jest.Mock).mockResolvedValue(mockCreatedCoin);

      const result = await coinService.createCoin(mockCoinData);

      expect(coinRepository.findByObjectId).toHaveBeenCalledWith('obj123');
      expect(coinRepository.create).toHaveBeenCalledWith(mockCoinData);
      expect(redisClient.del).toHaveBeenCalledWith('coins:all:*');
      expect(redisClient.del).toHaveBeenCalledWith('coins:trending:*');
      expect(result).toEqual(mockCreatedCoin);
    });

    it('should throw error if coin already exists', async () => {
      const mockCoinData = {
        name: 'ExistingCoin',
        symbol: 'EC',
        objectId: 'obj123',
        creatorAddress: '0x123',
        supply: '1000000',
        price: 0.001,
        marketCap: '1000',
        volume24h: '100',
        priceChange24h: '5',
        holders: 10
      };
      const existingCoin = { id: '1', ...mockCoinData };

      (coinRepository.findByObjectId as jest.Mock).mockResolvedValue(existingCoin);

      await expect(coinService.createCoin(mockCoinData)).rejects.toThrow(ERROR_MESSAGES.COIN_ALREADY_EXISTS);
      expect(coinRepository.create).not.toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      const mockCoinData = {
        name: 'NewCoin',
        symbol: 'NC',
        objectId: 'obj123',
        creatorAddress: '0x123',
        supply: '1000000',
        price: 0.001,
        marketCap: '1000',
        volume24h: '100',
        priceChange24h: '5',
        holders: 10
      };
      const error = new Error('Test error');

      (coinRepository.findByObjectId as jest.Mock).mockResolvedValue(null);
      (coinRepository.create as jest.Mock).mockRejectedValue(error);

      await expect(coinService.createCoin(mockCoinData)).rejects.toThrow(ERROR_MESSAGES.COIN_CREATION_FAILED);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('updateCoin', () => {
    it('should update an existing coin', async () => {
      const mockCoinData = {
        price: 0.002,
        marketCap: '2000',
        volume24h: '200',
        priceChange24h: '10',
        holders: 20
      };
      const existingCoin = { id: '1', name: 'OldCoin' };
      const updatedCoin = {
        id: '1',
        name: 'OldCoin',
        price: 0.002,
        marketCap: '2000',
        volume24h: '200',
        priceChange24h: '10',
        holders: 20
      };

      (coinRepository.findById as jest.Mock).mockResolvedValue(existingCoin);
      (coinRepository.update as jest.Mock).mockResolvedValue(updatedCoin);

      const result = await coinService.updateCoin('1', mockCoinData);

      expect(coinRepository.findById).toHaveBeenCalledWith('1');
      expect(coinRepository.update).toHaveBeenCalledWith('1', mockCoinData);
      expect(redisClient.del).toHaveBeenCalledWith('coins:id:1');
      expect(redisClient.del).toHaveBeenCalledWith('coins:all:*');
      expect(redisClient.del).toHaveBeenCalledWith('coins:trending:*');
      expect(result).toEqual(updatedCoin);
    });

    it('should throw error if coin not found', async () => {
      const mockCoinData = {
        price: 0.002,
        marketCap: '2000',
        volume24h: '200',
        priceChange24h: '10',
        holders: 20
      };

      (coinRepository.findById as jest.Mock).mockResolvedValue(null);

      await expect(coinService.updateCoin('nonexistent', mockCoinData)).rejects.toThrow(ERROR_MESSAGES.COIN_NOT_FOUND);
      expect(coinRepository.update).not.toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      const mockCoinData = {
        price: 0.002,
        marketCap: '2000',
        volume24h: '200',
        priceChange24h: '10',
        holders: 20
      };
      const existingCoin = { id: '1', name: 'OldCoin' };
      const error = new Error('Test error');

      (coinRepository.findById as jest.Mock).mockResolvedValue(existingCoin);
      (coinRepository.update as jest.Mock).mockRejectedValue(error);

      await expect(coinService.updateCoin('1', mockCoinData)).rejects.toThrow(ERROR_MESSAGES.COIN_UPDATE_FAILED);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getTotalCoins', () => {
    it('should return count from cache if available', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue('10');

      const result = await coinService.getTotalCoins();

      expect(redisClient.get).toHaveBeenCalledWith('coins:count');
      expect(coinRepository.count).not.toHaveBeenCalled();
      expect(result).toEqual(10);
    });

    it('should fetch count from repository if not in cache', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(null);
      (coinRepository.count as jest.Mock).mockResolvedValue(10);

      const result = await coinService.getTotalCoins();

      expect(redisClient.get).toHaveBeenCalledWith('coins:count');
      expect(coinRepository.count).toHaveBeenCalled();
      expect(redisClient.set).toHaveBeenCalledWith(
        'coins:count',
        '10',
        'EX',
        expect.any(Number)
      );
      expect(result).toEqual(10);
    });

    it('should handle errors', async () => {
      const error = new Error('Test error');
      (redisClient.get as jest.Mock).mockRejectedValue(error);

      await expect(coinService.getTotalCoins()).rejects.toThrow(ERROR_MESSAGES.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
