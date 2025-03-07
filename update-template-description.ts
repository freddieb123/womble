
import { db } from "./db";
import { chatConfigs, eq } from "./db/schema";

async function updateTemplateDescription() {
  try {
    const configId = 65;
    const templateDescription = "Practise using Strategyzer's Value Proposition Canvas";
    
    const result = await db.update(chatConfigs)
      .set({ 
        templateDescription 
      })
      .where(eq(chatConfigs.id, configId))
      .returning();
    
    if (result.length === 0) {
      console.log(`Config with ID ${configId} not found`);
    } else {
      console.log(`Successfully updated template description for config ID ${configId}`);
      console.log(result[0]);
    }
  } catch (error) {
    console.error("Error updating template description:", error);
  } finally {
    process.exit(0);
  }
}

updateTemplateDescription();
