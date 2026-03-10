const express = require('express')
const { Server } = require('socket.io')
const http = require('http')

const getUserDetailsFromToken = require('../helpers/getUserDetailsFromToken')
const UserModel = require('../models/UserModel')
const { ConversationModel, MessageModel } = require('../models/ConversationModel')
const getConversation = require('../helpers/getConversation')

const app = express()

/*** socket connection */
const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL,
        credentials: true
    }
})

/*** online users */
const onlineUser = new Set()

io.on('connection', async (socket) => {

    console.log("connect User", socket.id)

    const token = socket.handshake.auth?.token

    const user = await getUserDetailsFromToken(token)

    if (!user) {
        console.log("Unauthorized socket connection")
        socket.disconnect()
        return
    }

    const currentUserId = user._id.toString()

    /** join personal room */
    socket.join(currentUserId)

    /** add to online users */
    onlineUser.add(currentUserId)

    /** send online user list */
    io.emit('onlineUser', Array.from(onlineUser))


    /** open message page */
    socket.on('message-page', async (userId) => {

        if (!userId) return

        const receiverId = userId.toString()

        const userDetails = await UserModel.findById(receiverId).select("-password")

        const payload = {
            _id: userDetails?._id,
            name: userDetails?.name,
            email: userDetails?.email,
            profile_pic: userDetails?.profilePic,
            online: onlineUser.has(receiverId)
        }

        socket.emit('message-user', payload)


        /** get previous messages */
        const getConversationMessage = await ConversationModel.findOne({
            "$or": [
                { sender: currentUserId, receiver: receiverId },
                { sender: receiverId, receiver: currentUserId }
            ]
        })
            .populate('messages')
            .sort({ updatedAt: -1 })

        socket.emit('message', getConversationMessage?.messages || [])
    })


    /** new message */
    socket.on('new message', async (data) => {

        if (!data?.sender || !data?.receiver) return

        let conversation = await ConversationModel.findOne({
            "$or": [
                { sender: data.sender, receiver: data.receiver },
                { sender: data.receiver, receiver: data.sender }
            ]
        })

        if (!conversation) {
            const createConversation = new ConversationModel({
                sender: data.sender,
                receiver: data.receiver
            })
            conversation = await createConversation.save()
        }

        const message = new MessageModel({
            text: data.text,
            imageUrl: data.imageUrl,
            videoUrl: data.videoUrl,
            msgByUserId: data.msgByUserId
        })

        const saveMessage = await message.save()

        await ConversationModel.updateOne(
            { _id: conversation._id },
            { "$push": { messages: saveMessage._id } }
        )


        const getConversationMessage = await ConversationModel.findOne({
            "$or": [
                { sender: data.sender, receiver: data.receiver },
                { sender: data.receiver, receiver: data.sender }
            ]
        })
            .populate('messages')
            .sort({ updatedAt: -1 })


        io.to(data.sender).emit('message', getConversationMessage?.messages || [])
        io.to(data.receiver).emit('message', getConversationMessage?.messages || [])


        /** update sidebar conversations */
        const conversationSender = await getConversation(data.sender)
        const conversationReceiver = await getConversation(data.receiver)

        io.to(data.sender).emit('conversation', conversationSender)
        io.to(data.receiver).emit('conversation', conversationReceiver)
    })


    /** sidebar conversations */
    socket.on('sidebar', async (currentUserId) => {

        if (!currentUserId) return

        const conversation = await getConversation(currentUserId)

        socket.emit('conversation', conversation)
    })


    /** mark messages seen */
    socket.on('seen', async (msgByUserId) => {

        if (!msgByUserId) return

        let conversation = await ConversationModel.findOne({
            "$or": [
                { sender: currentUserId, receiver: msgByUserId },
                { sender: msgByUserId, receiver: currentUserId }
            ]
        })

        const conversationMessageId = conversation?.messages || []

        await MessageModel.updateMany(
            { _id: { "$in": conversationMessageId }, msgByUserId: msgByUserId },
            { "$set": { seen: true } }
        )

        const conversationSender = await getConversation(currentUserId)
        const conversationReceiver = await getConversation(msgByUserId)

        io.to(currentUserId).emit('conversation', conversationSender)
        io.to(msgByUserId).emit('conversation', conversationReceiver)
    })


    /** disconnect */
    socket.on('disconnect', () => {

        onlineUser.delete(currentUserId)

        io.emit('onlineUser', Array.from(onlineUser))

        console.log("disconnect user", socket.id)
    })

})

module.exports = {
    app,
    server
}