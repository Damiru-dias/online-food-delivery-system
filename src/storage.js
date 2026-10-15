const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'db.json');

function readDb() {
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading db.json:', err);
    return {
      system: {
        restaurantName: "BiteBreeze Food Express",
        currency: "USD",
        currencySymbol: "$",
        taxPercentage: 10,
        deliveryFee: 3.50,
        freeDeliveryThreshold: 35.00
      },
      promoCodes: [],
      categories: [],
      foods: [],
      users: [],
      orders: []
    };
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error writing db.json:', err);
    return false;
  }
}

module.exports = {
  readDb,
  writeDb
};
