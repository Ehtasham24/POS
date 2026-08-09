const {
  generateSignature,
} = require("../../../Sevices/ThirdParty/PayFast/payFastService");
const asyncHandler = require("../../../utils/asyncHandler");

const FormSubmission = asyncHandler(async (req, res) => {
  console.log("Form Submission");
  const { firstName, lastName, email, amount, itemName } = req.body;

  const myData = {
    merchant_id: process.env.PAY_FAST_MERCHANT_ID,
    merchant_key: process.env.PAY_FAST_MERCHANT_KEY,
    return_url: "http://www.facebook.com",
    cancel_url: "http://www.youtube.com",
    notify_url: " https://6fa5-101-53-236-238.ngrok-free.app/api/payfast/ITN",
    name_first: firstName,
    name_last: lastName,
    email_address: email,
    m_payment_id: Math.random().toString(36).substr(2, 9),
    amount: amount,
    item_name: itemName,
  };

  const myPassphrase = process.env.PAY_FAST_MERCHANT_PASSPHRASE;
  myData.signature = generateSignature(myData, myPassphrase);

  // Generate HTML form
  let htmlForm = `<form action="${process.env.PAY_FAST_URL}" method="post">`;
  for (let key in myData) {
    if (myData.hasOwnProperty(key)) {
      const value = myData[key];
      if (value !== "") {
        htmlForm += `<input name="${key}" type="hidden" value="${value.trim()}" />`;
      }
    }
  }
  htmlForm += '<input type="submit" value="Pay Now" /></form>';

  res.send(htmlForm);
});

//ITN handler controller function not responding while calling the relevent services function handlingITN

// const HandleITN = async (req, res) => {
//   console.log("ITN handler hit");
//   console.log("Req.body at HandleITN => ", req.body);
//   try {
//     const response = await handlingITN();
//     if (response.status == "OK") {
//       res.send("response:", response.body);
//     }
//   } catch (err) {
//     res.status("error: ", err);
//   }
// };

module.exports = { FormSubmission };
