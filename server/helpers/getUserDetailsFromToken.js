const jwt = require("jsonwebtoken")
const UserModel = require("../models/UserModel")

async function getUserDetailsFromToken(token) {

    try {

        if(!token){
            return null
        }

        const decode = jwt.verify(token, process.env.JWT_SECRET_KEY)

        const user = await UserModel
            .findById(decode.id)
            .select("-password")

        return user

    } catch (error) {
        console.log("JWT error:", error.message)
        return null
    }

}

module.exports = getUserDetailsFromToken