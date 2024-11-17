const io = require("socket.io-client");
const readline = require("readline");
const crypto = require("crypto"); // generate rsa

const socket = io("http://localhost:3000");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let targetUsername = "";
let username = "";
const users = new Map();
let privateKey = "";
let publicKey = "";

// Generate RSA key pair
function generateKeyPair() { // generate key pair  
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048, 
    publicKeyEncoding: { type: "spki", format: "pem" }, // public & private key using  pem
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { publicKey, privateKey };
}

function encryptMessage(message, targetPublicKey) { // encrypt message with public key 
  return crypto.publicEncrypt(targetPublicKey, Buffer.from(message)).toString("base64"); 
  // convert to buffer for encryption
}

function decryptMessage(ciphertext) {
  try { // encrypt using private key 
    return crypto.privateDecrypt(privateKey, Buffer.from(ciphertext, "base64")).toString(); // convert cypher to buffer
  } catch (err) {
    return "Failed to decrypt message.";
  }
}

({ publicKey, privateKey } = generateKeyPair()); //  generate private & public key 

socket.on("connect", () => {
  console.log("Connected to the server");

  socket.on("init", (keys) => {
    keys.forEach(([user, key]) => users.set(user, key));
    console.log(`\nThere are currently ${users.size} users in the chat`);
    rl.prompt();

    rl.question("Enter your username: ", (input) => {
      username = input;
      console.log(`Welcome, ${username} to the chat`);

      socket.emit("registerPublicKey", {
        username,
        publicKey,
      });

      rl.prompt();

      rl.on("line", (message) => {
        if (message.trim()) {
          if ((match = message.match(/^!secret (\w+)$/))) {
            targetUsername = match[1];
            console.log(`Now secretly chatting with ${targetUsername}`);
          } else if (message.match(/^!exit$/)) {
            console.log(`No more secretly chatting with ${targetUsername}`);
            targetUsername = "";
          } else {
            let encryptedMessage = message;
            if (targetUsername) {
              const targetPublicKey = users.get(targetUsername); // takepublic ket from target user
              if (targetPublicKey) {
                encryptedMessage = encryptMessage(message, targetPublicKey); // encrypt with target user public key
              } else {
                console.log(`Public key for ${targetUsername} not found.`);
              }
            }
            socket.emit("message", { username, message: encryptedMessage, targetUsername }); 
            // send encrpyted text
        }
        rl.prompt();
      }});
    });
  });
});

socket.on("newUser", (data) => {
  const { username, publicKey } = data;
  users.set(username, publicKey);
  console.log(`${username} joined the chat`);
  rl.prompt();
});

socket.on("message", (data) => {
  const { username: senderUsername, message: senderMessage, targetUsername } = data;

  if (username === senderUsername && targetUsername) { // if sender is user and sending secret text, dont encrpyt
    return;
  }

  if (targetUsername && targetUsername !== username) { //  check all if uname=target uname
    console.log(`${senderUsername}: ${senderMessage}`); // show ciphertext
  } else {
    let outputMessage;
    if (targetUsername === username) { // if uname=target uname
      outputMessage = decryptMessage(senderMessage); // decrpt text 
    } else { // check public or secret mode
      outputMessage = senderMessage;
    }

    console.log(`${senderUsername}: ${outputMessage}`); // output
  }

  rl.prompt();
});



socket.on("disconnect", () => {
  console.log("Server disconnected, Exiting...");
  rl.close();
  process.exit(0);
});

rl.on("SIGINT", () => {
  console.log("\nExiting...");
  socket.disconnect();
  rl.close();
  process.exit(0);
});