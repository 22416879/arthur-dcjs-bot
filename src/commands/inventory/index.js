import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { inventoryDB } from '../../database/inventoryDB.js'; // 💡 引入你剛才寫好的資料庫工具

export const command = new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('查看背包道具');

export const action = async (interaction) => {
    const userId = interaction.user.id;

    // 1. 💡 從真實的 JSON 資料庫讀取該玩家的背包數據
    const dbInventory = inventoryDB.get(userId);

    // 2. 定義對應的中文名稱與圖示（對應你資料庫中的 key）
    const itemNames = {
        c_ticket: '🎟️ C 級招募券',
        r_ticket: '🎟️ R 級招募券',
        sr_ticket: '🎟️ SR 級招募券',
        ssr_ticket: '🎟️ SSR 級招募券',
        sss_ticket: '🎟️ SSS 級招募券'
    };

    // 3. 獲取玩家在該伺服器的自訂暱稱
    const memberName = interaction.member ? interaction.member.displayName : interaction.user.username;

    // 4. 建立背包內嵌訊息 (Embed)
    const inventoryEmbed = new EmbedBuilder()
        .setColor('#FFA500') // 橘色外框
        .setTitle('🎒 道具背包')
        .setThumbnail(interaction.user.displayAvatarURL()) // 顯示玩家頭像
        .setTimestamp();

    let hasItems = false;

    // 5. 檢查並動態加入數量大於 0 的道具
    Object.keys(itemNames).forEach((key) => {
        const count = dbInventory[key] || 0; // 取得資料庫中該道具的真實數量

        // 只有當數量大於 0 時才顯示
        if (count > 0) {
            inventoryEmbed.addFields({
                name: `${itemNames[key]}`,
                value: `擁有數量：\`${count}\` 張`,
                inline: false
            });
            hasItems = true; 
        }
    });

    // 6. 設定描述文字
    if (!hasItems) {
        inventoryEmbed.setDescription('❌ 目前背包內沒有任何道具');
    } else {
        inventoryEmbed.setDescription(`這是 **${memberName}** 在此伺服器擁有的招募券清單：`);
    }

    // 7. 回覆玩家背包內容
    await interaction.reply({ embeds: [inventoryEmbed] });
};
