const mongoose = require("mongoose");
const UserSchema = mongoose.Schema({
    name: {
        type: String
    },
    email: {
        type: String,
        required: true
    },
    password: {
        type: String
    },
    rollno: {
        type: String
    },
    regStatus: {
        type: Boolean,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now()
    },
    wallet: {
        type: String,
        default: ""
    },
    loginTime: {
        type: Date,
        default: Date.now()
    }
});
module.exports = mongoose.model("user", UserSchema);
//# sourceMappingURL=user.js.map