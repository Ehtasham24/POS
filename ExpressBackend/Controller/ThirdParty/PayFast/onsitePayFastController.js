const { v4: uuidv4 } = require("uuid");
const {
  generateSignature,
} = require("../../../Sevices/ThirdParty/PayFast/generateSignatureService");
const axios = require("axios");
const asyncHandler = require("../../../utils/asyncHandler");

const paymentDetails = asyncHandler(async (req, res) => {
  console.log("Inside controller function");
  console.log("Req body at controller function: ", req.body);

  const passPhrase = "jt7NOE43FZPn ";
  // process.env.PAY_FAST_MERCHANT_PASSPHRASE;
  console.log(passPhrase);
  const merchant_id = "10000100";
  // process.env.PAY_FAST_MERCHANT_ID;
  const merchant_key = "46f0cd694581a";
  // process.env.PAY_FAST_MERCHANT_KEY;

  const {
    firstName,
    lastName,
    email,
    amount,
    itemName,
    cardNumber,
    expiryDate,
    cvv,
  } = req.body;

  // Create myData object
  const myData = {
    merchant_id,
    merchant_key,
    return_url:
      "https://6fa5-101-53-236-238.ngrok-free.app/api/payfast/onsite",
    notify_url:
      "https://6fa5-101-53-236-238.ngrok-free.app/api/payfast/onsite",
    cancel_url:
      "https://6fa5-101-53-236-238.ngrok-free.app/api/payfast/onsite",
    name_first: firstName,
    name_last: lastName,
    email_address: email,
    m_payment_id: uuidv4(),
    amount,
    item_name: itemName,
    card_number: cardNumber,
    card_expiry: expiryDate,
    card_cvv: cvv,
  };

  console.log("Initial Payload===> ", myData);

  // Convert the data object to a string (excluding signature)
  let pfParamString = dataToString(myData);
  console.log(
    "PF params string before signature:================> ",
    pfParamString
  );

  // Generate signature and add it to myData
  myData["signature"] = generateSignature(myData, passPhrase);
  console.log(
    "After signature generation===============================>",
    myData
  );

  // Convert the updated myData object to a string again (including signature)
  pfParamString = dataToString(myData);
  console.log(
    "PF params string after signature:================> ",
    pfParamString
  );

  // Generate payment identifier
  const identifier = await generatePaymentIdentifier(pfParamString);
  console.log("identifier=====>", identifier);

  res.send({ success: true, identifier });
});

// Convert data object to a string
const dataToString = (dataArray) => {
  try {
    let pfParamString = "";
    for (let key in dataArray) {
      if (dataArray.hasOwnProperty(key)) {
        let value = dataArray[key];
        if (typeof value !== "string") {
          value = String(value);
        }
        pfParamString += `${key}=${encodeURIComponent(value.trim()).replace(
          /%20/g,
          "+"
        )}&`;
      }
    }
    return pfParamString.slice(0, -1);
  } catch (err) {
    console.error(err);
    throw Error(err);
  }
};

// Generate payment identifier
const generatePaymentIdentifier = async (pfParamString) => {
  try {
    const result = await axios.post(
      "https://sandbox.payfast.co.za/onsite/process",
      pfParamString,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    console.log("Response Data:", result.data);
    return result.data.uuid || null;
  } catch (err) {
    console.error(
      "Error submitting payment:",
      err.response ? err.response.data : err.message
    );
    throw Error(err.response ? err.response.data : err.message);
  }
};

module.exports = { paymentDetails };
