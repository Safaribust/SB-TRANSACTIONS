const express = require("express");
var mysql = require('mysql');

const { v4: uuidv4 } = require('uuid');
const axios = require("axios");



const mongoose = require("mongoose");
const formatDate = require("./utils/formatDate");

require("dotenv").config();


const User = require("./models/users");
const Account = require("./models/account");
const Transaction = require("./models/transactions");
const Logs = require("./models/logs");
const Bet = require("./models/bet");

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.post("/deposit", async (req, res, next) => {
      const {userId,amount,phone}=req.body
    
          const consumer_key = "e9U18oviHqQdAzrIP6jupLtjPTI16OmJ";
          const consumer_secret = "n53UGl05vCeLGz1H";
          const url =
            "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
          const auth = Buffer.from(`${consumer_key}:${consumer_secret}`).toString("base64");
          const { data } = await axios.get(url, {
            headers: { Authorization: "Basic" + " " + auth },
          }).catch(err=>console.log(err))
          
            const timestamp = formatDate();
            const shortcode = 4097295;
            const passkey ="1bbf1ad26591bc48bca5faf176845a5feb3c929d96097ae77d3f45a84e2c339e";
            const password = Buffer.from(
              shortcode + passkey + timestamp
            ).toString("base64");
            let dt = JSON.stringify({
                  BusinessShortCode: shortcode,
                  Password: password,
                  Timestamp: timestamp,
                  TransactionType: "CustomerPayBillOnline",
                  Amount: parseInt(amount),
                  PartyA: parseInt(phone),
                  PartyB: shortcode,
                  PhoneNumber: parseInt(phone),
                  CallBackURL:
                    "https://www.safaribust.co.ke/pesaxpress/STK/callback.php",
                  AccountReference: parseInt(phone),
                  TransactionDesc: "Deposit to SAFARIBUST Account",
                })

           await axios( {
                method: 'post',
                url:'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
                headers:{
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${data.access_token}`,
                  Host: "api.safaricom.co.ke"
                },
              data:dt
             }).then(result=>{
                res.status(200).json({status:200, message:"Request successful"})
                next()
             }).catch(err=>console.log(err));    
});

app.post("/withdraw", async (req, res, next) => {
        const {userId, amount, phone}=req.body
        const account = await Account.findOne({user:userId});
        const user = await User.findOne({phone:phone});
         const bets = await Bet.find({user:userId});
        let sum = bets.reduce((acc, obj) => {
          return acc + parseFloat(obj.betAmount);
        }, 0);

        if(user.label === "2" && sum <= user.firstDeposit){
          throw new Error("You need to place bets amounting to your first deposit to withdraw");
        }

        if(parseFloat(amount) > parseFloat(account.balance)){
          throw new Error("Insufficient balance in your wallet")
        }

        const ipAddress = req.socket.remoteAddress;
        const consumer_key = "qhygNtCpa5tAMxAf3sjvvxXvHTtJkoAf";
        const consumer_secret = "gN9j1ZYPz4PBcOjr";
        const url =
            "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
          const auth = Buffer.from(`${consumer_key}:${consumer_secret}`).toString("base64");
          const { data } = await axios.get(url, {
            headers: { Authorization: "Basic" + " " + auth },
          });

          const shortcode = 3034427;
          const passkey =
              "BCZcLvkd0lJU+AkbjLcbesMIdn4viqoI9B9jhiTMs2yJlxWAiLTeNm/ftOXz9rlgWdqHlMOW1JirTs/yGpH/yad/BECGKjCtrC0Wi0sj7e1vgoutLBgzXaUrNkSPQxE9aPAuw1Of4DROwy1eYtby+M0Ir/3qFDEWprkn/RRdsLGfaIv5leWGOa1SIbv0vdY13gBQAT1h2kiMWbyHZKgzcO90mZ5GerfUJk/ID4s/3DF+XkOe0Zmfg/1hX8va36SI67gY2OOlf60fYp5Ss2p1ISlE6qgudSd76Qxk3xTf9QhdoJmGPFt5Izq828h90+T139kINIkoOikMPcKYrvbCXA==";

          let dt = JSON.stringify({
                  InitiatorName: "KARIUKI",
                  SecurityCredential:passkey,
                  CommandID: "BusinessPayment",
                  Amount: parseInt(amount),
                  PartyA: shortcode,
                  PartyB:  parseInt(phone),
                  Remarks: `Withdrawal: ${account.user.username}-${phone}`,
                  QueueTimeOutURL: "https://www.safaribust.co.ke/pesaxpress/B2C/timeout.php",
                  ResultURL: "https://sb-transactions-5tlj.onrender.com/cb/result",
                  Occassion: `Withdrawal: ${account.user.username}-${phone}`,
                })

             await axios( {
                method: 'post',
                url:'https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest',
                headers:{
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${data.access_token}`,
                  Host: "api.safaricom.co.ke"
                },
              data:dt
             }).then(async (result)=>{
              const id = uuidv4();
              if(result){
                account.balance =parseFloat(+account?.balance - +amount).toFixed(2);
                await account.save().then(async(res)=>{
                  if(user.label === "2"){
                    user.label = "3"
                    await user.save()
                  }
                  const trans= new Transaction({
                            type:"Withdrawal",
                            trans_id:id.split("-")[0],
                            bill_ref_number:phone,
                            trans_time:formatDate(),
                            amount:amount,
                            phone:phone,
                            conversationID:result.data.ConversationID,
                            username:user.username,
                            balance:account?.balance
                          })  
                  await trans.save()
                  const log = new Logs({
                    ip: ipAddress,
                    description: `Withdrawn ${amount} - Account Name:${phone}`,
                    user: userId,
                    transactionId:id.split("-")[0],
                    conversationID:result.data.ConversationID,
                    balance:account?.balance     
                    });    
                    await log.save()
                }).catch(err=>{
                  console.log(err)
                })
                          
              }
                res.status(200).json({status:200, message:"Request successful"})
                next()
             }).catch(err=>console.log(err));
})

app.post("/cb/result", async(req,res,next)=>{
  let response = req.body.Result
  console.log(response);
   if(response.ConversationID) {
    const trans= await Transaction.findOne({conversationID:response.ConversationID})
    trans.trans_id = response.TransactionID
    await trans.save().then(async(res)=>{
          const logs=await Logs.findOne({conversationID:response.ConversationID})
              logs.transactionId = response.TransactionID
              await logs.save()
    }).catch(err=>console.log(err))
   }
  next()
})

app.post("/status", async(req,res,next)=>{
  const {code}=req.body;
  const transaction = await Transaction.findOne({trans_id:code})
    if(transaction){
      return res.status(200).json({status:200, message:"Already deposited"})
    }
})

app.get("/data",(req,res)=>{
  res.json({data:{
    hello:"hello"
  }})
})
const MONGO_URI =  "mongodb+srv://Safaribust:safaribust@cluster0.yuiecha.mongodb.net/?retryWrites=true&w=majority";
const PORT = process.env.PORT || 9000;

mongoose
.connect(
  `${MONGO_URI}`,{
    useNewUrlParser: true,
    useUnifiedTopology: true
  }
)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.log(err);
  });
