import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('view')
    .setDescription('查看卡牌');

export const action = async (interaction) => {
    // 移除 ephemeral 或設為 false，這樣所有在頻道內的人都能看到這條回應
    await interaction.reply({ 
        content: '🔮 正在查看卡牌庫...', 
        ephemeral: false 
    });
};
