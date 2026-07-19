export function printReceipt(salesData, totalAmount) {
  const receiptContent = `
  <html>
    <head>
      <title>Receipt</title>
      <style>
        body {
          font-family: 'Arial', sans-serif;
          padding: 10px;
          width: 300px; /* Adjust for thermal printer width */
          margin: 0;
        }
        h2 {
          text-align: center;
          font-size: 20px;
          margin-bottom: 5px;
        }
        h3 {
          margin: 0;
          font-size: 16px;
          text-align: center;
        }
        h4 {
          text-align: center;
          margin-top: 10px;
          font-size: 18px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 10px 0;
        }
        th, td {
          border: 1px solid #ccc;
          padding: 5px;
          text-align: left;
          font-size: 14px;
        }
        th {
          background-color: #f4f4f4;
        }
        .thank-you {
          text-align: center;
          margin-top: 20px;
          font-size: 14px;
        }
        .no-return {
          text-align: center;
          margin-top: 10px;
          font-size: 12px;
          font-weight: bold;
        }

        /* Custom styles for thermal printing */
        #thermal-print {
          width: 58mm; /* Width specific to thermal printer */
          font-size: 12px;
        }
        #thermal-print h2 {
          font-size: 18px;
        }
        #thermal-print table th, #thermal-print table td {
          font-size: 10px;
        }
      </style>
    </head>
    <body>
      <div id="thermal-print">
        <h2 style="font-weight: bold;">Pak Home and Kitchen Appliances</h2>
        <h2>Receipt</h2>

        <table>
          <thead>
            <tr>
              <th>Sale ID</th>
              <th>Product ID</th>
              <th>Product Name</th>
              <th>Price</th>
              <th>Quantity</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${
              salesData.length > 0
                ? salesData
                    .map(
                      (sale) => `
              <tr>
              <td>${sale.id}</td>
                <td>${sale.product_id}</td>
                <td>${sale.productname}</td>
                <td>${sale.selling_price}</td>
                <td>${sale.quantity}</td>
                <td>Rs.${(sale.selling_price * sale.quantity).toFixed(2)}</td>
              </tr>
              `
                    )
                    .join("") // Join all rows into a single string
                : `<tr><td colspan="5" class="text-center">No sale data available</td></tr>`
            }
          </tbody>
        </table>
        <h4>Total Amount: Rs.${totalAmount.toFixed(2)}</h4>
        <p class="thank-you">Thank you for your purchase!</p>
        <p class="no-return">No purchased item will be returned or exchanged.</p>
        <p class="no-return">خریدا ہوا مال واپسی یہ تبدیل نہیں ہوگا۔</p>
      </div>
    </body>
  </html>
  `;

  const receiptWindow = window.open("", "_blank", "width=400,height=600");
  if (receiptWindow) {
    receiptWindow.document.write(receiptContent);
    receiptWindow.document.close();
    receiptWindow.print();
    receiptWindow.close();
  }
}
