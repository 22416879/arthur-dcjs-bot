import mongoose from 'mongoose';

export const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error("找不到 MONGO_URI 環境變數，請檢查 .env 檔案");
        }
        await mongoose.connect(uri);
        console.log('🍃 MongoDB 雲端資料庫連線成功！');
    } catch (error) {
        console.error('❌ 資料庫連線失敗:', error);
        process.exit(1);
    }
};
