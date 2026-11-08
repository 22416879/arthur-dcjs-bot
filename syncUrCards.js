import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { v2 as cloudinary } from 'cloudinary';

// 1. 設定 Cloudinary 配置
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '你的_CLOUD_NAME',
  api_key: process.env.CLOUDINARY_API_KEY || '你的_API_KEY',
  api_secret: process.env.CLOUDINARY_API_SECRET || '你的_API_SECRET'
});

// 2. 設定 MongoDB 連線
const mongoUri = process.env.MONGO_URI || "你的_MONGODB_ATLAS_連線字串";
const client = new MongoClient(mongoUri);

// 🎯 建立 6 位數隨機短代碼產生器（排除容易混淆的 l, 1, o, 0）
function generateShortCode() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'; 
  let code = '';
  for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function syncUrCloudinaryToMongo() {
  try {
    // 連線到 MongoDB
    await client.connect();
    console.log("成功連線至 MongoDB！");
    
    const database = client.db('card_bot_db'); 
    const urCardsCollection = database.collection('ur_cards'); // 指向你專屬的 UR 資料庫集合

    console.log("正在從 Cloudinary 撈取 ur_cards 資料夾的圖片清單...");

    // 3. 使用 Cloudinary Search API 鎖定 ur_cards 資料夾
    const cloudinaryResult = await cloudinary.search
      .expression('folder:ur_cards AND resource_type:image') // 鎖定你的 UR 雲端資料夾路徑
      .with_field('context')
      .with_field('metadata') 
      .sort_by('public_id','desc')
      .max_results(500)
      .execute();

    const images = cloudinaryResult.resources;
    console.log(`成功從 Cloudinary 的 ur_cards 資料夾找到 ${images.length} 張圖片。`);

    if (images.length === 0) {
      console.log("該資料夾內沒有找到任何圖片，結束執行。");
      return;
    }

    // 4. 將 Cloudinary 的資料轉換為 MongoDB 格式
    const cardDocuments = images.map(img => {
      const displayName = 
        img.context?.custom?.caption || 
        img.context?.caption || 
        img.display_name || 
        img.filename; 

      return {
        name: displayName,        // 對齊前端所需的欄位名稱
        characterName: displayName, 
        imageUrl: img.secure_url,   
        cloudinaryPublicId: img.public_id,
        series: img.context?.custom?.series || img.context?.series || '酒館限定特典', // 支援從 Cloudinary 讀取作品系列
        rarity: 'UR', // 固定塞入 UR 標籤
        syncedAt: new Date()
      };
    });

    console.log("正在為 UR 限定卡牌進行智慧比對，並指派 6 位數唯一的專屬短代碼...");
    
    let insertedCount = 0;
    let updatedCount = 0;
    let codeAssignedCount = 0;

    // 5. 智慧遍歷並處理代碼
    for (const card of cardDocuments) {
      // 先去 ur_cards 集合翻看這張卡以前同步過沒
      const existingCard = await urCardsCollection.findOne({ cloudinaryPublicId: card.cloudinaryPublicId });
      
      let finalCode = existingCard?.code;

      // 如果是新卡，或者舊卡身上沒有 code，在記憶體幫它算一組唯一的隨機序號
      if (!finalCode) {
        let uniqueCode = generateShortCode();
        
        // 防撞安全機制：確保算出來的這組 6 位數在目前的 ur_cards 中沒有被別張卡牌撞過
        let isDup = await urCardsCollection.findOne({ code: uniqueCode });
        while (isDup) {
          uniqueCode = generateShortCode();
          isDup = await urCardsCollection.findOne({ code: uniqueCode });
        }
        
        finalCode = uniqueCode;
        codeAssignedCount++;
      }

      // 執行智慧更新與覆蓋到 ur_cards 集合
      const result = await urCardsCollection.updateOne(
        { cloudinaryPublicId: card.cloudinaryPublicId }, 
        { 
          $set: { 
            name: card.name,
            characterName: card.characterName, 
            imageUrl: card.imageUrl,
            series: card.series,
            rarity: card.rarity,
            code: finalCode
          },
          $setOnInsert: {
            syncedAt: card.syncedAt            
          }
        },                          
        { upsert: true } 
      );
      
      if (result.upsertedCount > 0) {
        insertedCount++;
      } else if (result.modifiedCount > 0) {
        updatedCount++;
      }
    }

    console.log(`\n🎉 UR 限定卡池同步暨序號指派大功告成！`);
    console.log(`✨ 成功幫 ${codeAssignedCount} 張 UR 卡片生成並綁定了全新的 6 位數獨立短代碼！`);
    console.log(`📦 UR 資料庫維護統計：新增 ${insertedCount} 張卡，覆蓋更新 ${updatedCount} 張卡。`);

  } catch (error) {
    console.error("同步 UR 卡片過程中發生錯誤:", error);
  } finally {
    await client.close();
  }
}

syncUrCloudinaryToMongo();
