// Simple test script to POST a sample order to the send-order endpoint.
// Usage:
//   node scripts/test-send-order.js https://your-site.netlify.app/.netlify/functions/send-order

const url = process.argv[2] || process.env.ENDPOINT;
if(!url){
  console.error('Usage: node scripts/test-send-order.js <endpoint_url>');
  process.exit(2);
}

const payload = {
  payerEmail: 'test@example.com',
  cart: [ { name: 'Gül', qty: 2, price: 45.00 }, { name: 'Kupa', qty: 1, price: 25.50 } ],
  iban: 'TRXXXXXXXXXXXXXXXXXXXXXXX'
};

(async ()=>{
  try{
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Body:', text);
  }catch(err){
    console.error('Request failed:', err);
    process.exit(1);
  }
})();
