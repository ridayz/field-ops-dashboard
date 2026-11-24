const res = await fetch('http://127.0.0.1:4780/api/dashboard?range=30d');
const text = await res.text();
console.log(res.status);
console.log(text.slice(0, 1200));
