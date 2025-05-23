import { Server } from 'http'
import { Server as SocketServer } from 'socket.io'
import { logger } from '../utils/logger'

class NotificationService {
  private io: SocketServer | null = null

  /**
   * Initialize Socket.IO server
   */
  initialize(server: Server) {
    this.io = new SocketServer(server, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
      },
    })

    this.io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`)

      // Handle subscription to coin updates
      socket.on('subscribe', (coinId: string) => {
        logger.info(`Client ${socket.id} subscribed to coin ${coinId}`)
        socket.join(`coin:${coinId}`)
      })

      // Handle unsubscription
      socket.on('unsubscribe', (coinId: string) => {
        logger.info(`Client ${socket.id} unsubscribed from coin ${coinId}`)
        socket.leave(`coin:${coinId}`)
      })

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`)
      })
    })

    logger.info('Notification service initialized')
  }

  /**
   * Send coin creation notification
   */
  notifyCoinCreated(coinData: any) {
    if (!this.io) {
      logger.warn('Notification service not initialized')
      return
    }

    this.io.emit('coin:created', coinData)
    logger.info(`Sent coin creation notification for ${coinData.name}`)
  }

  /**
   * Send transaction notification
   */
  notifyTransaction(coinId: string, transactionData: any) {
    if (!this.io) {
      logger.warn('Notification service not initialized')
      return
    }

    // Emit to all clients subscribed to this coin
    this.io.to(`coin:${coinId}`).emit('transaction', transactionData)

    // Also emit to global transaction feed
    this.io.emit('transactions:new', transactionData)

    logger.info(`Sent transaction notification for coin ${coinId}`)
  }

  /**
   * Send price update notification
   */
  notifyPriceUpdate(coinId: string, priceData: any) {
    if (!this.io) {
      logger.warn('Notification service not initialized')
      return
    }

    this.io.to(`coin:${coinId}`).emit('price:update', priceData)
    logger.info(`Sent price update notification for coin ${coinId}`)
  }

  /**
   * Send pool creation notification
   */
  notifyPoolCreated(poolData: any) {
    if (!this.io) {
      logger.warn('Notification service not initialized')
      return
    }

    // Emit to all clients subscribed to this coin
    this.io.to(`coin:${poolData.coinId}`).emit('pool:created', poolData)

    // Also emit to global feed
    this.io.emit('pools:new', poolData)

    logger.info(`Sent pool creation notification for coin ${poolData.coinId}`)
  }

  /**
   * Send DEX listing notification
   */
  notifyDexListing(listingData: any) {
    if (!this.io) {
      logger.warn('Notification service not initialized')
      return
    }

    // Emit to all clients subscribed to this coin
    this.io.to(`coin:${listingData.coinId}`).emit('dex:listed', listingData)

    // Also emit to global feed
    this.io.emit('dex:new_listing', listingData)

    logger.info(`Sent DEX listing notification for coin ${listingData.coinId} (${listingData.symbol})`)
  }
}

export default new NotificationService()
