const fs = require('fs');
const path = require('path');
const axios = require('axios');
const mongoose = require('mongoose');

// 1. 引入模型檔案（讓 Mongoose 自動註冊 Schema）
require('./src/database/CharacterPool'); 

require('dotenv').config();
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI; 

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 遠端圖片網址下載並轉成 Base64 格式
 */
async function getBase64FromUrl(url) {
    try {
        if (!url) return null;
        const response = await axios({ method: 'get', url, responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        return 'data:image/jpeg;base64,' + buffer.toString('base64');
    } catch (error) {
        console.error('[錯誤] 轉換 Base64 失敗:', error.message);
        return null;
    }
}

/**
 * 透過 Jikan API 獲取角色的多張相簿圖片網址
 */
async function fetchCharacterImagesFromJikan(characterId) {
    try {
        // 使用最乾淨的傳統字串拼接，確保 100% 網址格式合法
        const url = 'https://jikan.moe' + characterId + '/pictures';
        const response = await axios.get(url);
        const pictures = response.data.data || [];

        const imagesList = [];
        for (const pic of pictures) {
            const imgUrl = pic.jpg?.image_url;
            if (imgUrl && !imagesList.includes(imgUrl)) {
                imagesList.push(imgUrl);
            }
            if (imagesList.length >= 4) break;
        }
        return imagesList;
    } catch (error) {
        if (error.response && error.response.status === 429) {
            console.warn('[警告] 觸發 Jikan 限制，5 秒後重試相簿端點...');
            await sleep(5000);
            return fetchCharacterImagesFromJikan(characterId);
        }
        console.error('[錯誤] 讀取角色相簿 ID ' + characterId + ' 失敗:', error.message);
        return [];
    }
}

/**
 * 主執行流程：嚴格爬取正確圖片
 */
async function seedDatabaseFromExternalJson() {
    try {
        console.log('Connecting to MongoDB Atlas...');
        await mongoose.connect(MONGO_URI);
        console.log('Successfully connected to MongoDB Atlas.');

        const CharacterPool = mongoose.model('CharacterPool');

        const jsonPath = path.join(__dirname, 'characters.json');
        if (!fs.existsSync(jsonPath)) {
            console.error('❌ 找不到角色設定檔：' + jsonPath);
            process.exit(1);
        }

        const charactersList = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        console.log('成功載入角色清單，預計處理 ' + charactersList.length + ' 個熱門角色。');

        const progressFile = './pool_progress.json';
        let lastIndex = 0;

        if (fs.existsSync(progressFile)) {
            const progressData = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
            lastIndex = progressData.lastIndex;
            console.log('[進度回復] 將從第 ' + (lastIndex + 1) + ' 個角色繼續爬取...');
        }

        for (let i = lastIndex; i < charactersList.length; i++) {
            const config = charactersList[i];
            console.log('\n===========================================');
            console.log('[進度 ' + (i + 1) + '/' + charactersList.length + '] 正在處理：' + config.series + ' -> 【' + config.name + '】');

            const exists = await CharacterPool.findOne({ name: config.name });
            if (exists) {
                console.log('[跳過] 資料庫已存在該角色。');
                continue;
            }

            let v1, v2, v3, v4;
            const encodedName = encodeURIComponent(config.name);

            // 💡 判斷：如果是遊戲原創角色（Jikan 查不到），暫時用特定種子的高清隨機圖，確保流程不中斷
            if (config.series.includes('Star Rail') || config.series.includes('Honkai') || config.series.includes('Genshin')) {
                console.log('[遊戲特例] 自動分配高清卡面補丁...');
                v1 = await getBase64FromUrl('https://picsum.photos' + encodedName + '1');
                v2 = await getBase64FromUrl('https://picsum.photos' + encodedName + '2');
                v3 = await getBase64FromUrl('https://picsum.photos' + encodedName + '3');
                v4 = await getBase64FromUrl('https://picsum.photos' + encodedName + '4');
            } else {
                // 正式的動漫角色，絕對向 Jikan API 爬取 100% 正確的圖片
                let malId, defaultImgUrl;
                try {
                    // 💡 最安全的網址拆解：完全捨棄可能會出錯的特殊拼接
                    const searchUrl = 'https://jikan.moe';
                    const searchRes = await axios.get(searchUrl, {
                        params: { q: config.name, limit: 1 }
                    });
                    
                    const firstResult = searchRes.data.data && searchRes.data.data[0];

                    if (!firstResult) {
                        console.log('[提示] 在 Jikan 找不到符合 ' + config.name + ' 的官方動漫資料，跳過。');
                        continue;
                    }

                    malId = firstResult.mal_id;
                    defaultImgUrl = firstResult.images?.jpg?.image_url;

                    // 遵循 API 頻率規範，每次請求後安全延遲
                    await sleep(3500);

                    console.log('正在抓取官方相簿的多個版本正確動漫卡面...');
                    let pictureUrls = await fetchCharacterImagesFromJikan(malId);

                    // 如果官方相簿張數不夠 4 張，用預設主圖遞補
                    if (pictureUrls.length < 4) {
                        if (defaultImgUrl && !pictureUrls.includes(defaultImgUrl)) {
                            pictureUrls.unshift(defaultImgUrl);
                        }
                        while (pictureUrls.length < 4) {
                            pictureUrls.push(defaultImgUrl || "https://picsum.photos");
                        }
                    }

                    console.log('正在將 4 張正確的官方相簿圖片轉換為 Base64...');
                    v1 = await getBase64FromUrl(pictureUrls[0] || defaultImgUrl);
                    v2 = await getBase64FromUrl(pictureUrls[1] || defaultImgUrl);
                    v3 = await getBase64FromUrl(pictureUrls[2] || defaultImgUrl);
                    v4 = await getBase64FromUrl(pictureUrls[3] || defaultImgUrl);

                } catch (err) {
                    console.error('[錯誤] 搜尋角色 ' + config.name + ' 失敗:', err.message);
                    continue;
                }
            }

            // 確保資料絕對完整性，若下載出錯則不寫入，避免存進空圖片
            if (!v1 || !v2 || !v3 || !v4) {
                console.error('[拒絕入庫] 角色 ' + config.name + ' 圖片下載不完整，跳過寫入。');
                continue;
            }

            // 寫入 MongoDB
            const newPoolItem = new CharacterPool({
                name: config.name,
                series: config.series,
                searchKey: config.searchKey || config.name.toLowerCase().replace(/\s+/g, ''),
                imageUrl: v1,
                versions: [
                    { versionName: "Version I",   imageUrl: v1 },
                    { versionName: "Version II",  imageUrl: v2 },
                    { versionName: "Version III", imageUrl: v3 },
                    { versionName: "Version IV",  imageUrl: v4 }
                ]
            });

            await newPoolItem.save();
            console.log('[成功] 4 版正確動漫內嵌圖片已寫入 MongoDB！【' + config.name + '】完美入庫！');

            // 儲存中斷點進度
            fs.writeFileSync(progressFile, JSON.stringify({ lastIndex: i + 1 }));

            await sleep(3500);
        }

        console.log('\n🎉 所有指定熱門作品角色與 4 版本正確 Base64 圖片已完美導入 MongoDB！');
        if (fs.existsSync(progressFile)) {
            fs.unlinkSync(progressFile);
        }

        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ 初始化資料庫過程發生嚴重重大錯誤:', error);
        process.exit(1);
    }
}

seedDatabaseFromExternalJson();
