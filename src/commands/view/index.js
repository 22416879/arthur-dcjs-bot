const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const { Card } = require('../../database/Card.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const FONT_STYLE = '"Source Han Serif TW", serif'; 

// 💡 補強：新增 UR 的設定，讓 /view 的 Canvas 圖層參數完全相容 6 號字樣
const RARITIES = [
  { code: 'C', colors: ['#2ecc71', '#27ae60'], borderColors: ['#a3e4d7', '#a9dfbf'], strokeColor: '#0e6251', glowColor: null, fontSize: 90 },   
  { code: 'R', colors: ['#00a8ff', '#00d2d3'], borderColors: ['#5cd1ff', '#64f3f4'], strokeColor: '#ffffff', glowColor: null, fontSize: 90 },   
  { code: 'SR', colors: ['#8e44ad', '#9b59b6'], borderColors: ['#d28eff', '#dfa8ff'], strokeColor: '#4b0082', glowColor: null, fontSize: 90 },   
  { code: 'SSR', colors: ['#ff9f43', '#ee5253'], borderColors: ['#ffca85', '#ff9293'], strokeColor: '#ffea79', glowColor: '#ff9f43', fontSize: 90 },  
  { code: 'SSS', colors: ['#f1c40f', '#f39c12'], borderColors: ['#ffe675', '#ffd254'], strokeColor: '#ff7f50', glowColor: '#f1c40f', fontSize: 90 },
  { code: 'UR', colors: ['#ff003c', '#ff4766'], borderColors: ['#ff6b8b', '#ff8a75'], strokeColor: '#6e0017', glowColor: '#ff003c', fontSize: 90 } // 🔥 補上 UR 特效參數
];

// 💡 補強：對照表加入 6 號 UR，徹底防禦混亂的卡面代碼
const rarityMap = { 1: 'C', 2: 'R', 3: 'SR', 4: 'SSR', 5: 'SSS', 6: 'UR', 'UR': 'UR' };

module.exports = {
    command: new SlashCommandBuilder()
        .setName("view")
        .setDescription("查看自己收藏的卡牌（還原為獲得時的卡面樣子）")
        .addStringOption(option => 
            option.setName("id")
                .setDescription("請輸入卡牌 5 位數編號（如 89569）或 6 位數背包短代碼（如 wi9ewi）")
                .setRequired(false)
        ),

    async action(interaction) {
        let cardIdInput = null;

        if (interaction.options && typeof interaction.options.getString === 'function') {
            cardIdInput = interaction.options.getString('id');
        } else if (interaction.id) {
            const cleanId = interaction.id.replace('#', '').trim();
            if (cleanId.length < 10) {
                cardIdInput = interaction.id;
            }
        }

        const userId = interaction.user ? interaction.user.id : (interaction.author ? interaction.author.id : null);
        if (!userId) return console.error('無法辨識使用者 ID');

        try {
            if (!Card) return await interaction.reply({ content: '❌ 系統錯誤：無法載入卡牌資料庫模型。' });

            // 撈取使用者的個人全背包 (test 資料表)
            const userCards = await Card.find({
                $or: [
                    { ownerId: userId }, { ownerid: userId }, { ownerId: String(userId) }, { ownerid: String(userId) }
                ]
            }).sort({ createdAt: -1 }).lean();

            if (!userCards || userCards.length === 0) {
                return await interaction.reply('😢 你目前還沒有收藏任何卡片喔！快去掉卡吧！');
            }

            let targetCard = null;

            if (cardIdInput) {
                const searchKey = cardIdInput.replace('#', '').trim().toLowerCase();

                // 🎯 核心補強 1：改用底層原生穿透對接，100% 免疫快取干擾
                const testDb = mongoose.connection.db;
                const cardsCollection = testDb.collection('cards');
                let matchedGlobalCard = await cardsCollection.findOne({ code: searchKey });

                // 🎯 核心補強 2：智慧雙重加查！如果一般池找不到短代碼，自動加查酒館盲盒池 ur_cards！
                if (!matchedGlobalCard) {
                    const urCollection = testDb.collection('ur_cards');
                    matchedGlobalCard = await urCollection.findOne({ code: searchKey });
                }

                if (matchedGlobalCard) {
                    targetCard = userCards.find(uc => {
                        const rawId = uc.cardid || uc.cardId || '';
                        return rawId.includes(matchedGlobalCard.cloudinaryPublicId) || uc.imageUrl === matchedGlobalCard.imageUrl;
                    });
                }

                // 如果短代碼沒對中，改走原本的 5-6 位數純卡號查詢
                if (!targetCard) {
                    let pureNumber = searchKey.padStart(5, '0');
                    targetCard = userCards.find(uc => {
                        let finalNum = '00000';
                        const rawId = uc.cardid || uc.cardId || '';
                        if (String(rawId).includes('_')) {
                            const arr = String(rawId).split('_');
                            finalNum = arr[arr.length - 1]; 
                        } else if (String(rawId).includes('/')) {
                            const arr = String(rawId).split('/');
                            finalNum = arr[arr.length - 1];
                        } else {
                            finalNum = String(rawId).replace('#', '');
                        }
                        const numMatch = String(finalNum).match(/\d+/);
                        const formattedNum = numMatch ? (String(numMatch) === '100000' ? '100000' : String(numMatch).padStart(5, '0')) : '00000';
                        return formattedNum === pureNumber;
                    });
                }

                if (!targetCard) {
                    return await interaction.reply(`❌ 在您的收藏中找不到編號或短代碼為 **${cardIdInput}** 的卡牌！`);
                }
            } else {
                // 預設拿最新的一張完整有效卡片
                targetCard = userCards.find(c => c.imagelink || c.imageLink || c.imageUrl) || userCards[0]; 
            }

            const displayName = targetCard.name || targetCard.characterName || "未知角色";
            const rawImage = targetCard.imagelink || targetCard.imageLink || targetCard.imageUrl;
            
            // 智慧稀有度轉碼 (透過修復後的對照表正確捕捉 6 號)
            let rarityCode = String(targetCard.rarity || '1').trim();
            if (rarityMap[rarityCode]) {
                rarityCode = rarityMap[rarityCode]; 
            }
            const rarity = RARITIES.find(r => r.code === rarityCode) || RARITIES[0];

            // 提取 5-6 位數純卡號
            let finalNum = '00000';
            const rawCardId = targetCard.cardid || targetCard.cardId || '';
            if (String(rawCardId).includes('_')) {
                const arr = String(rawCardId).split('_');
                finalNum = arr[arr.length - 1];
            } else if (String(rawCardId).includes('/')) {
                const arr = String(rawCardId).split('/');
                finalNum = arr[arr.length - 1];
            } else {
                finalNum = String(rawCardId).replace('#', '');
            }
            const numMatch = String(finalNum).match(/\d+/);
            const displayId = numMatch ? (String(numMatch) === '100000' ? '100000' : String(numMatch).padStart(5, '0')) : '00000';
            const currentNum = parseInt(displayId, 10);

            if (!rawImage || rawImage.includes('undefined')) {
                return await interaction.reply(`⚠️ 卡牌 **${displayName}** 的原圖網址不存在或已損毀。`);
            }

            const isMock = interaction.followUp && !interaction.applicationId;
            if (isMock) {
                await interaction.reply('⏳ 正在從畫布調用您的實體卡片樣式...');
            } else {
                await interaction.deferReply();
            }

            // 核心 Canvas 初始化
            const canvas = createCanvas(380, 600); 
            const ctx = canvas.getContext('2d');
                       const startX = 0;
            const startY = 20; 
            const cardWidth = 380;
            const cardHeight = 560;
            const borderRadius = 16;
            const topPadding = 56;
            const imgHeight = 459; 
            const NUMBER_FONT_STYLE = '"MantouSans-Regular", "MantouSans", "饅頭黑體", sans-serif';

            // 💡 核心修正：將字串與流水號的宣告提早挪到最上方，徹底根除 numberText is not defined 報錯！
            const numberText = `NO . ${displayId}`;

            // 初始外層透明/暗底色
            ctx.clearRect(0, 0, 380, 600);

            // 初始黑底 (100% 同步您 drop 的第 129 行)
            ctx.fillStyle = '#1c1d21';
            ctx.beginPath();
            ctx.roundRect(startX, startY, cardWidth, cardHeight, borderRadius);
            ctx.fill();

            // A. 圓角裁切並畫入角色原圖 (100% 同步您 drop 的第 131-136 行)
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(startX + 12, startY + topPadding, cardWidth - 24, imgHeight, 8); 
            ctx.closePath();
            ctx.clip();
            const charImage = await loadImage(rawImage);
            ctx.drawImage(charImage, startX + 12, startY + topPadding, cardWidth - 24, imgHeight);
            ctx.restore();

            // B. 繪製底部卡號黑襯底條 (100% 同步您 drop 後半段第 7 行)
            ctx.save();
            ctx.font = `24px ${NUMBER_FONT_STYLE}`; 
            ctx.textAlign = 'left';
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
            ctx.restore();

            // C. 繪製卡牌純編號文字 (100% 同步您 drop 後半段第 13-33 行的顏色與字型分流區間)
            ctx.save();
            ctx.font = `24px ${NUMBER_FONT_STYLE}`; 
            ctx.textAlign = 'left';

            if (currentNum < 10 || currentNum === 87123) {
                ctx.strokeStyle = '#f1c40f';
                ctx.lineWidth = 3;
                ctx.strokeText(numberText, startX + 24, startY + cardHeight - 18);
                ctx.fillStyle = '#ee5253';
                ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
            } else if (currentNum > 0 && currentNum <= 100000 && currentNum % 11111 === 0) {
                ctx.fillStyle = '#ff9ff3';
                ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
            } else if (currentNum < 100) {
                ctx.fillStyle = '#ee5253';
                ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
            } else if (currentNum < 1000) {
                ctx.fillStyle = '#ff9f43';
                ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
            } else if (currentNum < 10000) {
                ctx.fillStyle = '#f1c40f';
                ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
            }
            ctx.restore();

            // D. 繪製稀度漸層粗邊框 (100% 複製您 drop 的 175-183 行)
            ctx.save();
            if (rarityCode === 'UR') {
                ctx.shadowColor = '#ff003c';
                ctx.shadowBlur = 22;
            } else if (rarity.glowColor) {
                ctx.shadowColor = rarity.glowColor;
                ctx.shadowBlur = 22;
            }
            const borderGradient = ctx.createLinearGradient(startX, startY, startX + cardWidth, startY + cardHeight);
            borderGradient.addColorStop(0, rarity.borderColors[0]);
            borderGradient.addColorStop(1, rarity.borderColors[1]);
            ctx.strokeStyle = borderGradient;
            ctx.lineWidth = 10;
            ctx.beginPath();
            ctx.roundRect(startX + 5, startY + 5, cardWidth - 10, cardHeight - 10, borderRadius - 2);
            ctx.stroke();
            ctx.restore();

            // E. 頂端繪製角色名字條與名字 (100% 複製您 drop 後半段第 43-47 行)
            ctx.save();
            ctx.font = "28px 'MyLevelFont', serif"; 
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            // 💡 智慧防禦：如果是酒館 UR 卡，底框採用專屬暗紅色，其餘等級套用資料庫原始設定
            ctx.strokeStyle = (rarityCode === 'UR') ? '#6e0017' : (rarity.strokeColor || '#ffffff');
            ctx.lineWidth = 1.5;
            ctx.strokeText(displayName.substring(0, 16), startX + cardWidth / 2, startY + 28);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(displayName.substring(0, 16), startX + cardWidth / 2, startY + 28);
            ctx.restore();

            // F. 右下角繪製漸層花體稀有度大字 (100% 複製您 drop 後半段第 50-59 行，字型完美同步)
            ctx.save();
            if (rarityCode === 'UR') {
                ctx.shadowColor = '#ff003c';
                ctx.shadowBlur = 15;
            } else if (rarity.glowColor) {
                ctx.shadowColor = rarity.glowColor;
                ctx.shadowBlur = 15;
            } else {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
                ctx.shadowBlur = 8;
            }
            const textGradient = ctx.createLinearGradient(startX, startY + 400, startX, startY + 540);
            textGradient.addColorStop(0, rarity.colors[0]);
            textGradient.addColorStop(1, rarity.colors[1]);
            
            const activeRarity = Array.isArray(rarity) ? rarity[0] : rarity;
            const finalFontSize = (activeRarity && activeRarity.fontSize) ? activeRarity.fontSize : 90;
            ctx.font = `italic bold ${finalFontSize}px ${FONT_STYLE}`;

            ctx.textAlign = 'right';
            ctx.strokeStyle = (rarityCode === 'UR') ? '#d4af37' : (rarity.strokeColor || '#ffffff');
            ctx.lineWidth = 2.5;
            
            ctx.strokeText(rarity.code, startX + cardWidth - 35, startY + cardHeight - 25);
            ctx.fillStyle = textGradient;
            ctx.fillText(rarity.code, startX + cardWidth - 35, startY + cardHeight - 25);
            ctx.restore();

            // 5. 輸出實體卡檔
            const buffer = canvas.toBuffer('image/png');
            const attachment = new AttachmentBuilder(buffer, { name: 'view_card.png' });

            const cardEmbed = new EmbedBuilder()
                .setImage('attachment://view_card.png')
                .setColor(rarityCode === 'UR' ? '#ff003c' : '#2b2d31');

            if (isMock) {
                return await interaction.followUp({ embeds: [cardEmbed], files: [attachment] });
            } else {
                return await interaction.editReply({ content: ' ', embeds: [cardEmbed], files: [attachment] });
            }

        } catch (error) {
            console.error('❌ View 渲染 Canvas 實體卡失敗：', error);
            const errMsg = `❌ 執行時發生錯誤：${error.message}`;
            if (interaction.replied || interaction.deferred) {
                return await interaction.followUp(errMsg);
            } else {
                return await interaction.reply(errMsg);
            }
        }
    }
};
