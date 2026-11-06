require('dotenv').config();
const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;

// 1. 設定 Cloudinary 配置
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || '你的_CLOUD_NAME',
  api_key: process.env.CLOUDINARY_API_KEY || '你的_API_KEY',
  api_secret: process.env.CLOUDINARY_API_SECRET || '你的_API_SECRET'
});

// 2. 設定 MongoDB 連線
const mongoUri = process.env.MONGO_URI || "你的_MONGODB_ATLAS_連線字串";
const client = new MongoClient(mongoUri);

// 🎯 核心補強 A：建立 6 位數隨機短代碼產生器（排除容易混淆的 l, 1, o, 0，玩家輸入最流暢）
function generateShortCode() {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789'; 
  let code = '';
  for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function syncCloudinaryToMongo() {
  try {
    // 連線到 MongoDB
    await client.connect();
    console.log("成功連線至 MongoDB！");
    
    const database = client.db('card_bot_db'); 
    const cardsCollection = database.collection('cards'); 

    console.log("正在從 Cloudinary 撈取圖片清單 (開啟全欄位掃描)...");

    // 3. 使用 Cloudinary Search API 撈取
    const cloudinaryResult = await cloudinary.search
      .expression('folder:arthur-bot AND resource_type:image')
      .with_field('context')
      .with_field('metadata') 
      .sort_by('public_id','desc')
      .max_results(500)
      .execute();

    const images = cloudinaryResult.resources;
    console.log(`成功從 Cloudinary 找到 ${images.length} 張圖片。`);

    if (images.length === 0) {
      console.log("沒有找到任何圖片，結束執行。");
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
        characterName: displayName, 
        imageUrl: img.secure_url,   
        cloudinaryPublicId: img.public_id,
        syncedAt: new Date()
      };
    });

    console.log("正在進行智慧比對，並全自動為 100 多張卡牌補齊 / 指派 6 位數唯一的專屬短代碼...");
    
    let insertedCount = 0;
    let updatedCount = 0;
    let codeAssignedCount = 0;

    // 5. 智慧遍歷並處理代碼
    for (const card of cardDocuments) {
      // 💡 先去資料庫翻看這張卡以前同步過沒，身上有沒有 code 欄位
      const existingCard = await cardsCollection.findOne({ cloudinaryPublicId: card.cloudinaryPublicId });
      
      let finalCode = existingCard?.code;

      // 🎯 核心補強 B：如果這張卡是新卡，或者舊卡身上沒有 code，立刻在記憶體幫它算一組唯一的隨機序號！
      if (!finalCode) {
        let uniqueCode = generateShortCode();
        
        // 防撞安全機制：確保算出來的這組 6 位數在目前的資料庫沒有被別張卡牌撞過
        let isDup = await cardsCollection.findOne({ code: uniqueCode });
        while (isDup) {
          uniqueCode = generateShortCode();
          isDup = await cardsCollection.findOne({ code: uniqueCode });
        }
        
        finalCode = uniqueCode;
        codeAssignedCount++;
      }

      // 執行智慧更新與覆蓋
      const result = await cardsCollection.updateOne(
        { cloudinaryPublicId: card.cloudinaryPublicId }, 
        { 
          $set: { 
            characterName: card.characterName, 
            imageUrl: card.imageUrl,
            code: finalCode // 🔥 將這組永久唯一的 6 位數短代碼寫入資料庫！
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

    console.log(`\n🎉 同步暨序號指派大功告成！`);
    console.log(`✨ 本次全自動成功幫 ${codeAssignedCount} 張卡片生成並綁定了全新的 6 位數獨立短代碼！`);
    console.log(`📦 資料庫維護統計：新增 ${insertedCount} 張卡，覆蓋更新名稱 ${updatedCount} 張卡。`);

  } catch (error) {
    console.error("同步過程中發生錯誤:", error);
  } finally {
    await client.close();
  }
}

syncCloudinaryToMongo();
