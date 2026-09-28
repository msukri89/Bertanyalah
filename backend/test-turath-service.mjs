import { searchTurath } from "./turath-service.mjs";

const queries = ["بيع لحم الأضحية", "بيع جلد الأضحية", "بيع الأضحية", "جلد الأضحية"];
console.log("Testing turath-service retrieval...");
const sources = await searchTurath(queries);
console.log("SOURCE_COUNT:", sources.length);
for (const s of sources.slice(0, 3)) {
  console.log(JSON.stringify({id:s.id,bookId:s.bookId,pageId:s.pageId,book:s.book,author:s.author,page:s.page,volume:s.volume,link:s.link}));
}
if (!sources.length) process.exit(1);
console.log("TURATH SERVICE RETRIEVAL: PASS");
