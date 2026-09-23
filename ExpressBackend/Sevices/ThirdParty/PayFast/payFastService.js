const { URLSearchParams } = require("url");
const crypto = require("crypto");
const { Pool } = require("pg");
const dns = require("dns");
const axios = require("axios");
const { generateSignature } = require("./generateSignatureService");

const pool = new Pool({
  user: process.env.USER,
  host: process.env.HOST,
  database: process.env.DATABASE,
  password: process.env.PASSWORD,
  port: process.env.PORT,
});

const handlingITN = async (req, res) => {
  console.log("ITN Service hit");
  console.log("Request Headers:", req.headers);
  console.log("Request body ======>:", req.body);

  try {
    const email = req.body.email;
    await postPayment(email);
    const pfData = req.body;
    let pfParamString = "";
    for (let key in pfData) {
      if (pfData.hasOwnProperty(key) && key !== "signature") {
        pfParamString += `${key}=${encodeURIComponent(
          pfData[key].trim()
        ).replace(/%20/g, "+")}&`;
      }
    }

    pfParamString = pfParamString.slice(0, -1);
    //for actual integration
    // const pfHost = testingMode ? "sandbox.payfast.co.za" : "www.payfast.co.za";
    //for sandbox
    const pfHost = "sandbox.payfast.co.za";

    const passPhrase = process.env.PAY_FAST_MERCHANT_PASSPHRASE;
    const check1 = verifySignature(pfData, pfParamString, passPhrase);
    const check2 = await pfValidIP(req);
    const cartTotal = req.body.amount_gross;
    const check3 = pfValidPaymentData(cartTotal, pfData);
    const check4 = await pfValidServerConfirmation(pfHost, pfParamString);

    if (check1 && check2 && check3 && check4) {
      res.status(200).send("Payment recorded");
    } else {
      console.error("Some checks have failed");
      res.status(400).send("Invalid transaction details");
    }
  } catch (error) {
    console.error("Error handling ITN:", error);
    res.status(500).send("Internal Server Error");
  }
};

const verifySignature = (pfData, pfParamString, passphrase = null) => {
  if (passphrase !== null) {
    pfParamString += `&passphrase=${encodeURIComponent(
      passphrase.trim()
    ).replace(/%20/g, "+")}`;
  }

  const signature = crypto
    .createHash("md5")
    .update(pfParamString)
    .digest("hex");
  return pfData["signature"] === signature;
};

const ipLookup = async (domain) => {
  return new Promise((resolve, reject) => {
    dns.lookup(domain, { all: true }, (err, address, family) => {
      if (err) {
        reject(err);
      } else {
        const addressIps = address.map((item) => item.address);
        resolve(addressIps);
      }
    });
  });
};

const pfValidIP = async (req) => {
  const validHosts = [
    "www.payfast.co.za",
    "sandbox.payfast.co.za",
    "w1w.payfast.co.za",
    "w2w.payfast.co.za",
  ];

  let validIps = [];
  // req.ip, not the raw X-Forwarded-For header — any client can send that header itself
  // with any IP it likes, which made this allow-list trivially bypassable. req.ip only
  // honors X-Forwarded-For when the request really came through a trusted proxy (server.js's
  // TRUST_PROXY), and is the socket's own address otherwise. A dual-stack socket reports an
  // IPv4 client as "::ffff:a.b.c.d", which would never equal the plain IPv4 addresses
  // ipLookup returns — hence the prefix strip. (Behind a proxy or tunnel without
  // TRUST_PROXY, req.ip is the proxy's address and the check correctly fails.)
  const pfIp = (req.ip || "").replace(/^::ffff:/, "");

  try {
    for (let key in validHosts) {
      const ips = await ipLookup(validHosts[key]);
      validIps = [...validIps, ...ips];
    }
  } catch (err) {
    console.error(err);
  }

  const uniqueIps = [...new Set(validIps)];
  return uniqueIps.includes(pfIp);
};

const pfValidPaymentData = (cartTotal, pfData) => {
  return (
    Math.abs(parseFloat(cartTotal) - parseFloat(pfData["amount_gross"])) <= 0.01
  );
};

const pfValidServerConfirmation = async (pfHost, pfParamString) => {
  try {
    const response = await axios.post(
      `https://${pfHost}/eng/query/validate`,
      pfParamString,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    return response.data === "VALID";
  } catch (error) {
    console.error(error);
    return false;
  }
};

module.exports = { handlingITN, generateSignature };

// const validatePayment = async (paymentId) => {
//   console.log("inside Validating payment");
//   try {
//     const merchantId = process.env.PAY_FAST_MERCHANT_ID;
//     const merchantKey = process.env.PAY_FAST_MERCHANT_KEY;

//     const url = `https://${pfHost}/eng/query/validate`;

//     const body = new URLSearchParams();
//     body.append("merchant_id", merchantId);
//     body.append("merchant_key", merchantKey);
//     body.append("payment_id", paymentId);

//     const response = await axios.post(url, body.toString(), {
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//         Authorization:
//           "Basic " +
//           Buffer.from(`${merchantId}:${merchantKey}`).toString("base64"),
//       },
//     });

//     const data = response.data;
//     console.log("response data", data);
//     return data.trim();
//   } catch (error) {
//     console.error("Error validating payment:", error);
//     return null;
//   }
// };

// const handleITN = async (req, res) => {
//   console.log("ITN route hit");
//   console.log("Request body:", req.body);

//   const response = await fetch(process.env.PAY_FAST_NOTIFICATION_URL, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/x-www-form-urlencoded",
//       Authorization:
//         "Basic " +
//         Buffer.from(
//           `${process.env.PAY_FAST_MERCHANT_ID}:${process.env.PAY_FAST_MERCHANT_KEY}`.toString(
//             "base64"
//           )
//         ),
//     },
//   });

//   try {
//     const {
//       payment_id, // This is PayFast's unique payment ID
//     } = req.body;

//     if (!payment_id) {
//       console.error("Payment ID is missing from the request");
//       return res.status(400).send("Payment ID is missing from the request");
//     }

//     // Fetch the actual payload from PayFast
//     const transactionDetails = await validatePayment(payment_id);

//     if (!transactionDetails || !transactionDetails.includes("VALID")) {
//       console.error("Invalid transaction details");
//       return res.status(400).send("Invalid transaction details");
//     }

//     // Parse the transaction details if they are in string format
//     const transactionData = new URLSearchParams(transactionDetails);
//     const transactionObj = {};
//     for (const [key, value] of transactionData.entries()) {
//       transactionObj[key] = value;
//     }

//     const {
//       item_name,
//       amount_gross,
//       name_first,
//       name_last,
//       email_address,
//       payment_status,
//       signature,
//     } = transactionObj;

//     // Validate the signature to ensure the request is from PayFast
//     const isValidSignature = verifySignature(
//       transactionObj,
//       process.env.PAY_FAST_MERCHANT_PASSPHRASE
//     );

//     if (!isValidSignature) {
//       console.error("Invalid signature");
//       return res.status(400).send("Invalid signature");
//     }

//     if (payment_status === "COMPLETE") {
//       const client = await pool.connect();
//       try {
//         await client.query(
//           `INSERT INTO payments (payment_id, item_name, amount_gross, name_first, name_last, email_address, payment_status, created_at)
//            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
//           [
//             payment_id,
//             item_name,
//             amount_gross,
//             name_first,
//             name_last,
//             email_address,
//             payment_status,
//           ]
//         );
//       } finally {
//         client.release();
//       }
//       res.status(200).send("Payment recorded");
//     } else {
//       res.status(200).send("Payment status not complete or not valid");
//     }
//   } catch (error) {
//     console.error("Error handling ITN:", error);
//     res.status(500).send("Internal Server Error");
//   }
// };
// module.exports = { handleITN };

// const generateSignature = (params, passphrase) => {
//   let string = "";
//   const keys = Object.keys(params).sort();

//   keys.forEach((key) => {
//     if (params[key]) {
//       string += `${key}=${encodeURIComponent(params[key])}&`;
//     }
//   });

//   // Remove trailing '&' character
//   string = string.slice(0, -1);

//   // Append passphrase if present
//   if (passphrase) {
//     string += `&passphrase=${encodeURIComponent(passphrase)}`;
//   }

//   console.log("Signature String:", string); // Print the signature string

//   return crypto.createHash("md5").update(string).digest("hex");
// };
// const getToken = async (query) => {
//   const passphrase = process.env.PAY_FAST_MERCHANT_PASSPHRASE;
//   // const signature = "50c9e64af5b0cfee3fa2a27cb41a84d9";

//   const signature = generateSignature(params, passphrase);
//   params.signature = signature;
//   const formData = new URLSearchParams(params).toString();

//   console.log("Form data sent to PayFast:", formData); // Debugging line to check the form data
//   console.log("Generated Signature:", signature);

//   try {
//     const response = await axios.post(
//       "https://sandbox.payfast.co.za/eng/process",
//       formData,
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//         },
//       }
//     );

//     return response.data;
//   } catch (error) {
//     throw new Error(error.response ? error.response.data : error.message);
//   }
// };

// const paymentPayfast = (passphrase, myData) => {
//   try {
//     const response = generateSignatureService(passphrase, myData);
//     let htmlForm = `<form action="${process.env.PAY_FAST_URL}" method="post">`;
//     for (let key in myData) {
//       if (myData.hasOwnProperty(key)) {
//         const value = myData[key];
//         if (value !== "") {
//           htmlForm += `<input name="${key}" type="hidden" value="${value.trim()}" />`;
//         }
//       }
//     }
//     htmlForm += '<input type="submit" value="Pay Now" /></form>';

//     // Serve the form
//     res.send(`
//       <!DOCTYPE html>
//       <html>
//       <head>
//         <title>PayFast Payment</title>
//       </head>
//       <body>
//         ${htmlForm}
//       </body>
//       </html>
//     `);
//   } catch (err) {
//     return err;
//   }
// };

//   try {
//     const response = await axios.post(
//       `https://sandbox.payfast.co.za/eng/process`,
//       new URLSearchParams({
//         merchant_id: merchantId,
//         merchant_key: merchantKey,
//         notify_url: urlNotification,
//         return_url: url,
//         name: "ehtasham",
//         email: "ehtasham123@gmail.com",
//         m_payment_id: 1234,
//         amount: 10000,
//         item_name: "test item",
//         payment_url: postPaymentUrl,
//       }),
//       {
//         headers: {
//           "Content-Type": "application/x-www-form-urlencoded",
//           "Cache-Control": "no-cache",
//         },
//       }
//     );
//     res.send(`payment initiated ${response}`);
//   } catch (err) {
//     console.log(err);
//     throw new Error(err);
//   }
// };
// const handlingITN = async (req, res) => {
//   console.log("ITN Service hit");
//   console.log("Raw Request body:", req.rawBody);
//   console.log("Request body:", req.body);

//   let payment_id;
//   try {
//     // Try parsing the raw body as URL-encoded data
//     const params = new URLSearchParams(req.rawBody);
//     payment_id = params.get("payment_id") || req.body.payment_id;

//     console.log("Parsed Payment ID:", payment_id);

//     // Define the URL for validation
//     const url = "https://sandbox.payfast.co.za/eng/query/validate";

//     // Construct the body for the validation request
//     const body = new URLSearchParams();
//     body.append("payment_id", payment_id);

//     // Make a POST request to the validation URL
//     const response = await fetch(url, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//       },
//       body: body.toString(),
//     });

//     // Check if the response is okay
//     if (!response.ok) {
//       throw new Error(`HTTP error! status: ${response.status}`);
//     }

//     // Get the response text
//     const data = await response.text();
//     console.log("Validation response data:", data);

//     // Process the response data
//     if (!data.includes("VALID")) {
//       console.error("Invalid transaction details");
//       return res.status(400).send("Invalid transaction details");
//     }

//     const transactionData = new URLSearchParams(data);
//     const transactionObj = {};
//     for (const [key, value] of transactionData.entries()) {
//       transactionObj[key] = value;
//     }

//     const {
//       item_name,
//       amount_gross,
//       name_first,
//       name_last,
//       email_address,
//       payment_status,
//       signature,
//     } = transactionObj;

//     const isValidSignature = verifySignature(
//       transactionObj,
//       process.env.PAY_FAST_MERCHANT_PASSPHRASE
//     );

//     if (!isValidSignature) {
//       console.error("Invalid signature");
//       return res.status(400).send("Invalid signature");
//     }

//     if (payment_status === "COMPLETE") {
//       const client = await pool.connect();
//       try {
//         await client.query(
//           `INSERT INTO payments (payment_id, item_name, amount_gross, name_first, name_last, email_address, payment_status, created_at)
//           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
//           [
//             payment_id,
//             item_name,
//             amount_gross,
//             name_first,
//             name_last,
//             email_address,
//             payment_status,
//           ]
//         );
//       } finally {
//         client.release();
//       }
//       res.status(200).send("Payment recorded");
//     } else {
//       res.status(200).send("Payment status not complete or not valid");
//     }
//   } catch (error) {
//     console.error("Error handling ITN:", error);
//     res.status(500).send("Internal Server Error");
//   }
// };
