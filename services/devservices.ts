import mongoose from "mongoose";
const ticketModel = require('../models/ticket');
const queueModel = require('../models/queue');
const busModel=require('../models/bus');
const busService = require('../services/busservices');
const adminModel = require('../models/admin');
import redisInstance from "../config/redis"
import { Response,Request } from 'express';
const bcrypt = require("bcryptjs");
const userService = require('../services/userservices');
const otpModel = require('../models/otp');
const stateService = require('../services/stateservices');

async function resetTickets(busId:string|null):Promise<Array<Object>>{
    try{
        const session = await mongoose.startSession();
        session.startTransaction();
        if(busId)
        {
            try{
                const ticketclr = await ticketModel.updateMany({
                    busId:busId
                },{
                    email: "",
                    txnId:"",
                    verified:false
                },
                { session } 
                ).session(session);
                const currbus = await busModel.findOne({_id:busId});
                let busclr = await busModel.updateOne({
                    _id:busId
                }, {
                    $set: {
                      sessionStart: false,
                      capacity: currbus.initialCapacity
                    }
                  },
                { session }
                ).session(session);    
                await session.commitTransaction();
    
                return [ticketclr,busclr];
            }catch(err)
            {
                await session.abortTransaction();
                return [String(err)];
            }finally{
                await session.endSession();
            }
    
            
        }else{
    
            try{        
                const ticketclr = await ticketModel.updateMany({},{
                    email: "",
                    txnId:"",
                    verified:false
                },
                { session }).session(session);
                const allbus=await busModel.find({});
                //TODO: Find a good aggregation pipeline
                for(const bus of allbus)
                {
                    await busModel.updateOne(
                        {
                            _id:bus._id
                        },
                        {
                            $set: {
                              sessionStart: false,
                              capacity: bus.initialCapacity
                            }
                          },
                        { session }
                      );
                }
    
    
                redisInstance.redisClient.flushAll();
                await session.commitTransaction();
                return [ticketclr];
            }catch(err)
            {
                await session.abortTransaction();
                return [String(err)];
            }finally{
                await session.endSession();
            }
        }
    }catch(err){
        return [err];
    }

}

async function deleteQueue():Promise<object>{
    try{
        const data = await queueModel.deleteMany({});
        return data;
    }catch(err)
    {
        return err;
    }

}

async function processQueue(){
    try{
        let page=0;
        const perPage = 10;
        const totalReqs = await queueModel.countDocuments({
            booking:{},txnId:""
        });
        console.log("total requests:"+totalReqs);
        while((page*perPage)<totalReqs)
        {
            const queueobjs = await queueModel.find({booking:{},txnId:""}).sort( { initTime: 1 } ).skip(perPage * page).limit(perPage);
            let noofjobs:number=queueobjs.length;
            console.log("processing"+noofjobs+"docs rn in iteration "+page);
            let currjobno:number=0;
            //Processing 1 request out of noofjobs
            while(currjobno<noofjobs)
            {
                const queuereq=queueobjs[currjobno];
                const preferences=queuereq['preferences'];
                const email=queuereq['email'];
                const docid=queuereq['id'];
                const madeat=queuereq['initTime'];
                let retry:boolean = true;
                function bookingsuccess(bookingdata:{}){
                    retry=false;       
                    busService.sendQueueMail(email,{...bookingdata,'message':'Success'},{'madeat':madeat,'preferences':preferences});
                }
        
                function bookingfaliure(errormessage:String){
                    if(errormessage=="Already Booked!" || errormessage=="Insufficient balance!" || errormessage=="No Match at end"){
                        retry=false;
                        busService.sendQueueMail(email,{'message':errormessage},{'madeat':madeat,'preferences':preferences});
                    }
                }
        
                async function updatequeue(bookingdata:{},session:mongoose.mongo.ClientSession){
                    await queueModel.updateOne({_id:docid},{booking:bookingdata,txnId:bookingdata['txnId']}).session(session);
                } 
        
                //Processing individual preferences;
                let i:number=0;
                let n:number=preferences.length;
                while(retry && i<n)
                {
                    let src=preferences[i]['source'];
                    let dest=preferences[i]['destination'];
                    let time=preferences[i]['startTime'];
                    await busService.bookTicket(email,src,dest,time,bookingfaliure,bookingsuccess,updatequeue);
                    i++;
                }
        
                if(retry && i==n) bookingfaliure("No Match at end");
                currjobno++;
            }
            page++;
        }
    }catch(err){
        console.log("error while processing queue:"+err);
        console.log("suspending");
        stateService.suspendOperations(err);
    }
        // queueobjs.forEach(async queuereq => {
            //THIS DOES NOT WAIT FOR CONTENTS WITHIN TO FINISH EXECUTING!!!!!!
        // });
}

async function deleteOTPs():Promise<object>{
    try{
        const data = await otpModel.deleteMany({});
        return data;
    }catch(err)
    {
        return err;
    }
}

async function resetPass(email:string,access:string,newpass:string,res:Response){
    try{    
        let user = await adminModel.find({
            email:email,
            access:access
        });
        if(!user)
        {
            res.status(404).json({
                "status":false,
                "message":"Invalid reset request"
            });
        }else{
            const saltrounds=10;
            const hashpass = await bcrypt.hashSync(newpass,saltrounds);
            await adminModel.updateOne({
                email:email,
                access:access
            },{
                $set:{
                    password:hashpass,
                }
            }
            ).then((data)=>{
                res.status(200).json({
                    "status":true,
                    "message":"Password reset successfully"
                });
            }).catch((error)=>{
                res.status(500).json({
                    "status":false,
                    "message":"Error resetting password!",
                    "data":String(error)
                });
            });
        }
    
    }catch(e){
        console.log('/resetAdminPassword',e);
            res.status(400).json({
                "status":false,
                "message":"Invalid request",
                'data':String(e)
            });
        }
}

async function resetPassSendOTP(email:string,access:string,res:Response)
{
    try{
    let admin = await adminModel.findOne({
        email:email,
        access:access
    });
    if(admin)
    {
        await userService.sendOTPMail('reset',email,res);
    }else{
        res.status(400).json({
            "status":false,
            "message":"User not found",
            "email":email
        });

    }
    }catch(e){
        console.log('/AdminresetPassSendOTP',e);
            res.status(400).json({
                "status":false,
                "message":"Error retriving admin",
            });
        }
}

async function resetPassVerifyOTP(email:string,unhashedOTP:string,res:Response)
{
    try{    
        await userService.verifyOTP(res,unhashedOTP,'adminReset',email);
    }catch(e){
        console.log('resetPassVerifyOTP',e);
            res.status(500).json({
                "status":false,
                "message":"Error Verifying OTP",
                'data':String(e)
            });
    }
}


module.exports={resetTickets,deleteQueue,processQueue,resetPass,resetPassSendOTP,resetPassVerifyOTP,deleteOTPs};