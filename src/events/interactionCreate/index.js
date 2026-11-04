import {Events} from "discord.js"
import {useAppStore} from "@/store/app.js"

export const event = {
    name:Events.InteractionCreate,}

export const action = async (interaction) => {
    if(!interaction.isChatInputCommand()) return;
    const appStore = useAppStore()
    const commandAction = appStore.commandsActionMap.get(interaction.commandName)
    
    await commandAction(interaction)
}