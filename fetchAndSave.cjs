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
      .with_field('metadata') // 💡 多抓取元資料欄位，確保萬無一失
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
      // 💡 終極相容取名邏輯：依次檢查所有可能存放 Display Name 的地方，如果都沒有才用原本的亂碼檔名
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

    // 5. 智慧比對並強制覆蓋更新 MongoDB
    console.log("正在將最正確的 Display Name 強制覆蓋至 MongoDB...");
    
    let insertedCount = 0;
    let updatedCount = 0;

    for (const card of cardDocuments) {
      const result = await cardsCollection.updateOne(
        { cloudinaryPublicId: card.cloudinaryPublicId }, 
        { 
          $set: { 
            characterName: card.characterName, // 🔥 強制複寫成我們抓到真正的好看名字
            imageUrl: card.imageUrl            
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

    console.log(`同步完成！本次順利補入 ${insertedCount} 張新卡，並成功強制覆蓋修正了 ${updatedCount} 張卡片的名字！`);

  } catch (error) {
    console.error("同步過程中發生錯誤:", error);
  } finally {
    await client.close();
  }
}

syncCloudinaryToMongo();
