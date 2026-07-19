const { pool } = require("../Db");

const insertSales = async (sellingPrice, SellingQuantity, product_id) => {
  try {
    await pool.query(
      `
      INSERT INTO sales (selling_price, quantity, product_id,sale_time)
      VALUES ($1, $2, $3,NOW())
      RETURNING *;
    `,
      [sellingPrice, SellingQuantity, product_id]
    );
  } catch (err) {
    throw new Error(err.message);
  }
};

const getRecentSales = async () => {
  try {
    // Step 1: Fetch the most recent sale data
    const recentSaleQuery = `
      SELECT 
          s.id, 
          s.selling_price, 
          s.quantity, 
          s.product_id, 
          DATE_TRUNC('second', s.sale_time) AS sale_time,  -- Truncate to seconds
          p.productname
      FROM public.sales s
      JOIN public.products p ON s.product_id = p.id
      ORDER BY s.sale_time DESC
      LIMIT 1;  -- Get only the most recent sale
    `;

    // Execute the query to get the most recent sale
    const recentSaleResult = await pool.query(recentSaleQuery);

    // Check if there is any recent sale data
    if (recentSaleResult.rows.length === 0) {
      return {
        message: "No sales data found",
        data: {
          salesData: [],
        },
      };
    }

    // Get the most recent sale's truncated time
    const recentSale = recentSaleResult.rows[0];
    const recentSaleTime = recentSale.sale_time; // This will be in seconds

    // Step 2: Fetch all sales that occurred at the same truncated time
    const sameTimeSalesQuery = `
      SELECT 
          s.id, 
          s.selling_price, 
          s.quantity, 
          s.product_id, 
          s.sale_time,
          p.productname
      FROM public.sales s
      JOIN public.products p ON s.product_id = p.id
      WHERE DATE_TRUNC('second', s.sale_time) = $1  -- Match the truncated time
      ORDER BY s.sale_time DESC;
    `;

    // Execute the query to get all sales at the same second
    const sameTimeSalesResult = await pool.query(sameTimeSalesQuery, [
      recentSaleTime,
    ]);

    // Prepare the response with the recent sales at the same time
    const salesData = sameTimeSalesResult.rows.map((row) => ({
      id: row.id,
      selling_price: row.selling_price,
      quantity: row.quantity,
      product_id: row.product_id,
      sale_time: row.sale_time,
      productname: row.productname,
    }));

    // Return the recent sales data
    return {
      message: "Recent sales fetched successfully",
      data: {
        salesData,
      },
    };
  } catch (error) {
    throw new Error("Error fetching recent sales: " + error.message);
  }
};

const updateSalesRecord = async (sellingPrice, SellingQuantity, product_id) => {
  try {
    const { rows } = await pool.query(
      `SELECT quantity FROM products WHERE id = $1`,
      [product_id]
    );

    const getQuantity = rows[0].quantity;

    let messageSend = "";
    let updatedQuantity = 0;
    if (isNaN(getQuantity)) {
      throw new Error("Invalid quantity value retrieved from the database");
    }

    if (isNaN(SellingQuantity)) {
      throw new Error("Invalid selling quantity provided");
    }

    if (SellingQuantity > getQuantity) {
      messageSend = "Insufficient inventory to process the sale";

      return { messageSend };
    } else {
      if (getQuantity < 10) {
        messageSend = "Inventory is less than 10";
      }

      await insertSales(sellingPrice, SellingQuantity, product_id);

      updatedQuantity = getQuantity - SellingQuantity;

      await pool.query(
        `UPDATE products
         SET quantity = $1
         WHERE id = $2`,
        [updatedQuantity, product_id]
      );
      messageSend = "Sale processed successfully";
      console.log(updatedQuantity, messageSend);

      return { updatedQuantity, messageSend };
    }
  } catch (err) {
    throw new Error(err.message);
  }
};

const fetchBilledHistory = async () => {
  try {
    const query = `
      SELECT s.id, s.selling_price, s.quantity, s.sale_time, s.product_id, p.productname
      FROM public.sales s
      JOIN public.products p ON s.product_id = p.id
      ORDER BY DATE_TRUNC('second', s.sale_time), s.id ASC;
    `;

    // Fetch the sales data from PostgreSQL
    const result = await pool.query(query);

    // Initialize an empty array for the grouped transactions
    const groupedSales = [];

    // Iterate over the sales data and group by selling_time (up to the second)
    result.rows.forEach((row, index) => {
      // Ensure sale_time exists and is valid
      if (!row.sale_time) {
        console.log(`Missing sale_time for id ${row.id}`);
        return; // Skip this entry if sale_time is null or undefined
      }

      const saleTime = row.sale_time.toISOString().slice(0, 19); // Slice the time to seconds

      // If the last group doesn't exist or sale_time has changed, start a new group
      if (
        groupedSales.length === 0 ||
        groupedSales[groupedSales.length - 1][0].sale_time
          .toISOString()
          .slice(0, 19) !== saleTime
      ) {
        groupedSales.push([]);
      }

      // Push the current row to the latest group
      groupedSales[groupedSales.length - 1].push({
        id: row.id,
        selling_price: row.selling_price,
        quantity: row.quantity,
        sale_time: row.sale_time,
        product_id: row.product_id,
        productname: row.productname,
      });
    });
    return groupedSales;
  } catch (err) {
    console.log(err);
    throw new Error(err.message);
  }
};

const isValidDate = (date) => {
  return !isNaN(new Date(date).getTime());
};

const fetchSales = async (startDate, endDate) => {
  try {
    // Validate date inputs
    if (
      !startDate ||
      !endDate ||
      !isValidDate(startDate) ||
      !isValidDate(endDate)
    ) {
      throw new Error(
        "Invalid date inputs. Please provide valid start and end dates."
      );
    }

    // Query to fetch product sales, calculate profit/loss, include buying price, and category
    const response = await pool.query(
      `SELECT 
         p.productname,
         p.category_id,
         c.category_name,  -- Fetch category name from the categories table
         p.buyingprice,  -- Include buying price
         SUM(s.quantity) AS total_quantity_sold,
         CAST(AVG(s.selling_price) AS INT) AS avg_selling_price,  -- Cast average selling price to INT
         CAST((AVG(s.selling_price) - p.buyingprice) AS INT) AS profit_loss,  -- Profit per piece as INT
         (SUM(s.quantity) * (AVG(s.selling_price) - p.buyingprice))::BIGINT AS overall_profit_loss  -- Total profit as BIGINT
       FROM Sales s
       INNER JOIN Products p ON s.product_id = p.id
       INNER JOIN Categories c ON p.category_id = c.id  -- Join with Categories table to get category name
       WHERE s.sale_time BETWEEN $1 AND $2
       GROUP BY p.productname, p.category_id, p.buyingprice, c.category_name  -- Group by necessary columns including category name
       ORDER BY profit_loss DESC`,
      [startDate, endDate]
    );

    // Extract sales data rows
    const salesData = response.rows;

    // Calculate the overall total profit/loss for all products
    const totalProfitLoss = salesData.reduce((acc, item) => {
      return acc + parseFloat(item.overall_profit_loss); // Convert overall_profit_loss to a number
    }, 0);

    // Return both sales data and total profit/loss
    return {
      salesData, // Product-wise profit/loss with category, buying price, and overall profit
      totalProfitLoss, // Total profit/loss for the specified timeframe
    };
  } catch (err) {
    console.log(err);
    throw err; // Ensure to throw the error to be caught in your controller
  }
};

const fetchSalesByProfitLoss = async (startDate, endDate, type) => {
  try {
    // Validate date inputs
    if (
      !startDate ||
      !endDate ||
      !isValidDate(startDate) ||
      !isValidDate(endDate)
    ) {
      throw new Error(
        "Invalid date inputs. Please provide valid start and end dates."
      );
    }

    // Determine the profit condition based on the type
    let profitCondition;
    if (type === "profit") {
      profitCondition =
        "(SUM(s.quantity) * (AVG(s.selling_price) - p.buyingprice))::BIGINT > 0"; // Show only positive overall profit
    } else if (type === "loss") {
      profitCondition =
        "(SUM(s.quantity) * (AVG(s.selling_price) - p.buyingprice))::BIGINT < 0"; // Show only negative overall profit
    } else {
      throw new Error("Invalid type. Must be 'profit' or 'loss'.");
    }

    const response = await pool.query(
      `SELECT 
         p.productname,
         p.category_id,
         c.category_name,
         p.buyingprice,  -- Include buying price
         SUM(s.quantity) AS total_quantity_sold,
         CAST(AVG(s.selling_price) AS INT) AS avg_selling_price,  -- Cast average selling price to INT
         CAST((AVG(s.selling_price) - p.buyingprice) AS INT) AS profit_loss,  -- Profit per piece as INT
         (SUM(s.quantity) * (AVG(s.selling_price) - p.buyingprice))::BIGINT AS overall_profit_loss  -- Total profit as BIGINT
       FROM Sales s
       INNER JOIN Products p ON s.product_id = p.id
       INNER JOIN Categories c ON p.category_id = c.id 
       WHERE s.sale_time BETWEEN $1 AND $2
       GROUP BY p.productname, p.category_id, p.buyingprice, c.category_name  -- Group by product name and buying price
       HAVING ${profitCondition} -- Apply the profit condition for profit-only items
       ORDER BY overall_profit_loss DESC`,
      [startDate, endDate]
    );

    // Extract sales data rows
    const salesData = response.rows;

    // Calculate the overall total profit/loss for the filtered products
    const totalProfitLoss = salesData.reduce((acc, item) => {
      return acc + parseFloat(item.overall_profit_loss); // Convert overall_profit to a number
    }, 0);

    // Return both the sales data and the total profit/loss
    return {
      salesData, // Product-wise profit/loss including buying price
      totalProfitLoss, // Total profit/loss for the specified timeframe and type
    };
  } catch (err) {
    console.log(err);
    throw err; // Ensure to throw the error to be caught in your controller
  }
};

module.exports = {
  updateSalesRecord,
  fetchSales,
  fetchSalesByProfitLoss,
  getRecentSales,
  fetchBilledHistory,
};
