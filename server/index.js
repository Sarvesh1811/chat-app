const express = require('express')
const cors = require('cors')
require('dotenv').config()
const connectDB = require('./config/connectDB')
const router = require('./routes/index')
const cookiesParser = require('cookie-parser')
const { app, server } = require('./socket/index')
const https = require('https')

app.use(cors({
  origin: [
    "http://localhost:3000",
    process.env.FRONTEND_URL
  ],
  credentials: true
}))
app.use(express.json())
app.use(cookiesParser())

const PORT = process.env.PORT || 8080

app.get('/', (request, response) => {
    response.json({
        message: "Server running at " + PORT
    })
})

// API endpoints
app.use('/api', router)

// Keep Render free tier alive (pings every 14 min so it never sleeps)
const keepAlive = () => {
    https.get('https://chat-app-backend-km3a.onrender.com', (res) => {
        console.log(`✅ Keep-alive ping. Status: ${res.statusCode}`)
    }).on('error', (err) => {
        console.log('Keep-alive ping failed:', err.message)
    })
}
setInterval(keepAlive, 14 * 60 * 1000)

connectDB().then(() => {
    server.listen(PORT, () => {
        console.log("server running at " + PORT)
    })
})