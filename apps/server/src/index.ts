import express, { type Request, type Response, type NextFunction } from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { roomManager } from './room-manager.js'
import { signalHandler } from './signal-handler.js'

const PORT = process.env['PORT'] ?? 3001

const app = express()

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', rooms: roomManager.count() })
})

app.get('/metrics', (_req: Request, res: Response) => {
  res.json({ rooms: roomManager.count() })
})

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: err.message })
})

const server = createServer(app)

const wss = new WebSocketServer({ server, path: '/signal' })
wss.on('connection', (ws) => signalHandler(ws, roomManager))

server.listen(PORT, () => {
  console.log(`Signaling server running on :${PORT}`)
})
