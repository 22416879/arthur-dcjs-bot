import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } from 'discord.js';
import { createCanvas, loadImage, registerFont } from 'canvas'; // 💡 把 registerFont 加到這裡
import mongoose from 'mongoose';
import { Card } from '../../database/Card.js';
import path from 'path'; // 💡 改用 import 語法引入 path

// 註冊卡牌字型（使用 100% 免疫沙盒隔離的 ESM 爬樓梯路徑）
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));

registerFont(path.join(__dirname, '../../../fonts/SOURCEHANSERIFTC-BOLD.OTF'), { family: 'Source Han Serif TC' });
registerFont(path.join(__dirname, '../../../fonts/MANTIOUSANS-REGULAR.TTF'), { family: 'Mantiousans-Regular' });

export const cooldowns = new Map();       
export const claimCooldowns = new Map();  

const RARITIES = [
  { code: 'C', colors: ['#2ecc71', '#27ae60'], borderColors: ['#a3e4d7', '#a9dfbf'], strokeColor: '#0e6251', glowColor: null, fontSize: 90, weight: 50 },   
  { code: 'R', colors: ['#00a8ff', '#00d2d3'], borderColors: ['#5cd1ff', '#64f3f4'], strokeColor: '#ffffff', glowColor: null, fontSize: 90, weight: 30 },   
  { code: 'SR', colors: ['#8e44ad', '#9b59b6'], borderColors: ['#d28eff', '#dfa8ff'], strokeColor: '#4b0082', glowColor: null, fontSize: 90, weight: 15},   
  { code: 'SSR', colors: ['#ff9f43', '#ee5253'], borderColors: ['#ffca85', '#ff9293'], strokeColor: '#ffea79', glowColor: '#ff9f43', fontSize: 90, weight: 4.5 },  
  { code: 'SSS', colors: ['#f1c40f', '#f39c12'], borderColors: ['#ffe675', '#ffd254'], strokeColor: '#ff7f50', glowColor: '#f1c40f', fontSize: 90, weight: 0.5 }   
];

function getRandomRarity() {
  const totalWeight = RARITIES.reduce((sum, r) => sum + r.weight, 0);
  let random = Math.random() * totalWeight;
  for (const rarity of RARITIES) {
    if (random < rarity.weight) return rarity;
    random -= rarity.weight;
  }
  return RARITIES[0];
}

async function generateUniqueNumber(cardsCollection, cloudinaryPublicId) {
  try {
    const DEBUG_NUMBER = null; 
    if (DEBUG_NUMBER !== null) return DEBUG_NUMBER;
    const issuedNumbers = await cardsCollection.find({ cloudinaryPublicId: cloudinaryPublicId }).project({ cardNumber: 1 }).toArray();
    const usedSet = new Set(issuedNumbers.map(c => c.cardNumber).filter(n => n !== undefined));
    if (usedSet.size >= 100000) usedSet.clear();
    while (true) {
      const randNum = Math.floor(Math.random() * 100000) + 1;
      if (!usedSet.has(randNum)) return randNum;
    }
  } catch (err) {
    return Math.floor(Math.random() * 100000) + 1; 
  }
}

function createComponentsRow(interactionId, claimStatus, isExpired = false) {
  const row = new ActionRowBuilder();
  for (let i = 0; i < 3; i++) {
    const btn = new ButtonBuilder().setCustomId(`claim_${interactionId}_${i}`);
    if (claimStatus[i]) {
      btn.setLabel(`被搶走 ${i + 1}`).setStyle(ButtonStyle.Danger).setDisabled(true);
    } else if (isExpired) {
      btn.setLabel(`已過期 ${i + 1}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
    } else {
      btn.setLabel(`搶卡 ${i + 1}`).setStyle(ButtonStyle.Primary).setDisabled(false);
    }
    row.addComponents(btn);
  }
  return row;
}

export const command = new SlashCommandBuilder().setName('drop').setDescription('隨機掉落 3 張動漫卡片！');

export const action = async (interaction) => {
  const userId = interaction.user.id;
  const COOLDOWN_TIME = 1 * 60 * 1000; 

  if (!interaction.client.dropCooldowns) interaction.client.dropCooldowns = new Map();
  if (!interaction.client.btnCooldowns) interaction.client.btnCooldowns = new Map();

  const dropCooldowns = interaction.client.dropCooldowns;
  const btnCooldowns = interaction.client.btnCooldowns;

  if (dropCooldowns.has(userId)) {
    const expirationTime = dropCooldowns.get(userId) + COOLDOWN_TIME;
    if (Date.now() < expirationTime) {
      const timeLeft = Math.round((expirationTime - Date.now()) / 1000); 
      return interaction.reply({ content: `❌ 掉卡冷卻中！請等待 **${timeLeft}** 秒。`, ephemeral: true });
    }
  }

  dropCooldowns.set(userId, Date.now()); 
  await interaction.deferReply(); 

  try {
    const cardsCollection = mongoose.connection.useDb('card_bot_db').collection('cards');
    const baseCards = await cardsCollection.aggregate([{ $sample: { size: 3 } }]).toArray();

    if (!baseCards || baseCards.length < 3) {
      return interaction.editReply("❌ 資料庫中的卡片數量不足 3 張.");
    }

    const droppedCards = [];
    for (const base of baseCards) {
      const rarity = getRandomRarity();
      const uniqueNum = await generateUniqueNumber(cardsCollection, base.cloudinaryPublicId);
      droppedCards.push({ 
        ...base, rarityCode: rarity.code, rarityColors: rarity.colors, borderColors: rarity.borderColors, 
        rarityStroke: rarity.strokeColor, rarityGlow: rarity.glowColor, raritySize: rarity.fontSize, cardNumber: uniqueNum 
      });
    }

    const canvas = createCanvas(1250, 600); 
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111214';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cardWidth = 380; const cardHeight = 560; const gap = 30; const borderRadius = 16; const topPadding = 56; const imgHeight = 459; 
    const FONT_STYLE = '"Source Han Serif TW", serif';
   // 🛠️ 修正：直接指定你電腦裡的 Action Force 字型名稱
const NUMBER_FONT_STYLE = '"MantouSans-Regular", "MantouSans_Regular", sans-serif';

    for (let i = 0; i < 3; i++) {
      const card = droppedCards[i];
      const startX = gap + i * (cardWidth + gap);
      const startY = 20;

      ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
      ctx.fillStyle = '#1c1d21';
      ctx.beginPath(); ctx.roundRect(startX, startY, cardWidth, cardHeight, borderRadius); ctx.fill();

      ctx.save();
      ctx.beginPath(); ctx.roundRect(startX + 12, startY + topPadding, cardWidth - 24, imgHeight, 8); ctx.closePath(); ctx.clip(); 
      try {
        const charImage = await loadImage(card.imageUrl);
        ctx.drawImage(charImage, startX + 12, startY + topPadding, cardWidth - 24, imgHeight);
      } catch (e) {
        ctx.fillStyle = '#2c2f33'; ctx.fillRect(startX + 12, startY + topPadding, cardWidth - 24, imgHeight);
      }
      ctx.restore(); 

      ctx.font = `24px ${NUMBER_FONT_STYLE}`; ctx.textAlign = 'left'; 
      const numberText = `NO . ${String(card.cardNumber).padStart(5, '0')}`;
      const currentNum = card.cardNumber;

      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillText(numberText, startX + 25, startY + cardHeight - 17);
      ctx.restore();

      ctx.save();
      const isRepeatedFiveDigits = currentNum > 0 && currentNum < 100000 && currentNum % 11111 === 0;

      if (currentNum < 10 || currentNum === 87123) {
          ctx.strokeStyle = '#f1c40f'; ctx.lineWidth = 3;
          ctx.strokeText(numberText, startX + 24, startY + cardHeight - 18);
          ctx.fillStyle = '#ee5253'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
      } 
      else if (isRepeatedFiveDigits) {
          ctx.fillStyle = '#ff9ff3'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
      } 
      else if (currentNum < 100) {
          ctx.fillStyle = '#ee5253'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
      } 
      else if (currentNum < 1000) {
          ctx.fillStyle = '#ff9f43'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
      } 
      else if (currentNum < 10000) {
          ctx.fillStyle = '#f1c40f'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
      } 
      else {
          ctx.fillStyle = '#ffffff'; ctx.fillText(numberText, startX + 24, startY + cardHeight - 18);
      }
      ctx.restore();

      ctx.save();
      if (card.rarityGlow) { ctx.shadowColor = card.rarityGlow; ctx.shadowBlur = 22; }
      const borderGradient = ctx.createLinearGradient(startX, startY, startX + cardWidth, startY + cardHeight);
      borderGradient.addColorStop(0, card.borderColors[0]); 
      borderGradient.addColorStop(1, card.borderColors[1]);
      ctx.strokeStyle = borderGradient; ctx.lineWidth = 10; ctx.beginPath(); ctx.roundRect(startX + 5, startY + 5, cardWidth - 10, cardHeight - 10, borderRadius - 2); ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.font = `bold 28px ${FONT_STYLE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; 
      const displayName = card.characterName || card.name || "未知角色";
      ctx.strokeStyle = card.rarityStroke; ctx.lineWidth = 1.5; ctx.strokeText(displayName.substring(0, 16), startX + cardWidth / 2, startY + 28);
      ctx.fillStyle = '#ffffff'; ctx.fillText(displayName.substring(0, 16), startX + cardWidth / 2, startY + 28); 
      ctx.restore();

      ctx.save(); 
      if (card.rarityGlow) { ctx.shadowColor = card.rarityGlow; ctx.shadowBlur = 15; } else { ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'; ctx.shadowBlur = 8; }
      const textGradient = ctx.createLinearGradient(startX, startY + 400, startX, startY + 540);
      textGradient.addColorStop(0, card.rarityColors[0]); 
      textGradient.addColorStop(1, card.rarityColors[1]);
      ctx.font = `italic bold ${card.raritySize}px ${FONT_STYLE}`; ctx.textAlign = 'right'; 
      ctx.strokeStyle = card.rarityStroke; ctx.lineWidth = 2.5; ctx.strokeText(card.rarityCode, startX + cardWidth - 35, startY + cardHeight - 25);
      ctx.fillStyle = textGradient; ctx.fillText(card.rarityCode, startX + cardWidth - 35, startY + cardHeight - 25); 
      ctx.restore(); 
    }

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'drop-cards.png' });
    const claimStatus = [false, false, false]; 
    let row = createComponentsRow(interaction.id, claimStatus, false);

    const mainMessage = await interaction.editReply({ content: `🎉 灑出了 3 張卡片！大家快來搶！`, files: [attachment], components: [row] });

    const collector = mainMessage.createMessageComponentCollector({ time: 120000 }); 

    collector.on('collect', async btnInteraction => {
      if (!btnInteraction.isButton()) return;
      const clickerId = btnInteraction.user.id;
      const CLAIM_COOLDOWN_TIME = 1 * 60 * 1000; 

      if (btnCooldowns.has(clickerId)) {
        const expire = btnCooldowns.get(clickerId) + CLAIM_COOLDOWN_TIME;
        if (Date.now() < expire) {
          const mins = Math.floor((expire - Date.now()) / 1000 / 60);
          const secs = Math.floor(((expire - Date.now()) / 1000) % 60);
          return btnInteraction.reply({ content: `❌ 搶卡冷卻中！請等待 **${mins}分 ${secs}秒**。`, ephemeral: true });
        }
      }

      const parts = btnInteraction.customId.split('_');
      const cardIndex = parseInt(parts[parts.length - 1]); 

      if (isNaN(cardIndex) || cardIndex < 0 || cardIndex > 2) return;
      if (claimStatus[cardIndex] === true) {
        return btnInteraction.reply({ content: `❌ 這張卡片已經被別人搶先一步撿走了！`, ephemeral: true });
      }

      try {
        claimStatus[cardIndex] = true;
        btnCooldowns.set(clickerId, Date.now()); 
        await btnInteraction.deferUpdate();
        
        const targetCard = droppedCards[cardIndex];
        const realCharacterName = targetCard.characterName || targetCard.name || "未知角色";
        const rarityMap = { 'C': 1, 'R': 2, 'SR': 3, 'SSR': 4, 'SSS': 5 };
        const rarityNumber = rarityMap[targetCard.rarityCode] || 1;

        const newOwnedCard = new Card({
          name: realCharacterName, 
          series: targetCard.series || "經典動漫", 
          version: "1",                                
          imageUrl: targetCard.imageUrl,
          cardId: `${targetCard.cloudinaryPublicId}_${targetCard.cardNumber}`, 
          rarity: rarityNumber,                                               
          quality: 4,                                  
          ownerId: clickerId 
        });

        await newOwnedCard.save();

        row = createComponentsRow(interaction.id, claimStatus, false);
        await interaction.editReply({ components: [row] });
        await interaction.followUp({ content: `🎉 恭喜 <@${clickerId}> 成功搶到了 **${realCharacterName}** (\`${targetCard.rarityCode}\` / NO.${String(targetCard.cardNumber).padStart(5, '0')})！` });
        
        if (claimStatus.every(status => status === true)) collector.stop();
      } catch (err) {
        console.error("發放卡片寫入資料庫失敗:", err);
        claimStatus[cardIndex] = false;
        row = createComponentsRow(interaction.id, claimStatus, false);
        await interaction.editReply({ components: [row] });
      }
    });

    collector.on('end', async () => {
      if (claimStatus.every(status => status === true)) return;
      try {
        const expiredRow = createComponentsRow(interaction.id, claimStatus, true);
        await interaction.editReply({ components: [expiredRow] });
      } catch (err) {}
    });

  } catch (outerErr) {
    console.error("卡片掉落核心崩潰錯誤:", outerErr);
    return interaction.editReply("❌ 執行卡片掉落時發生未知錯誤。");
  }
};
