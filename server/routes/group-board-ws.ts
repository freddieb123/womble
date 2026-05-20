import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import { db } from '@db';
import { groupBoardPostIts, groupBoardComments } from '@db/schema';
import { eq } from 'drizzle-orm';

const rooms = new Map<number, Set<WebSocket>>();

async function getBoardState(configId: number) {
  const [postIts, comments] = await Promise.all([
    db.select().from(groupBoardPostIts).where(eq(groupBoardPostIts.configId, configId)),
    db.select().from(groupBoardComments).where(eq(groupBoardComments.configId, configId)),
  ]);
  return { postIts, comments };
}

function broadcast(configId: number, data: object) {
  const room = rooms.get(configId);
  if (!room) return;
  const msg = JSON.stringify(data);
  room.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

export async function broadcastBoardState(configId: number) {
  const state = await getBoardState(configId);
  broadcast(configId, { type: 'board:state', ...state });
}

export function setupGroupBoardWS(server: Server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws/group-board') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws) => {
    let configId: number | null = null;

    ws.on('message', async (raw) => {
      try {
        const msg = JSON.parse(raw.toString());

        if (msg.type === 'join') {
          configId = Number(msg.configId);
          if (!rooms.has(configId)) rooms.set(configId, new Set());
          rooms.get(configId)!.add(ws);
          const state = await getBoardState(configId);
          ws.send(JSON.stringify({ type: 'board:state', ...state }));
          return;
        }

        if (!configId) return;

        switch (msg.type) {
          case 'postit:add':
            await db.insert(groupBoardPostIts).values({
              configId,
              groupNumber: Number(msg.groupNumber),
              authorName: msg.authorName || 'Anonymous',
              text: String(msg.text),
              color: msg.color || '#fbbf24',
              posX: Math.round(Math.max(0, Math.min(90, Number(msg.posX ?? 10)))),
              posY: Math.round(Math.max(0, Math.min(90, Number(msg.posY ?? 10)))),
              isTrainer: Boolean(msg.isTrainer),
            });
            break;

          case 'postit:move':
            await db.update(groupBoardPostIts)
              .set({
                posX: Math.round(Math.max(0, Math.min(90, Number(msg.posX)))),
                posY: Math.round(Math.max(0, Math.min(90, Number(msg.posY)))),
                updatedAt: new Date(),
              })
              .where(eq(groupBoardPostIts.id, Number(msg.postitId)));
            break;

          case 'postit:edit':
            await db.update(groupBoardPostIts)
              .set({ text: String(msg.text), updatedAt: new Date() })
              .where(eq(groupBoardPostIts.id, Number(msg.postitId)));
            break;

          case 'postit:delete':
            await db.delete(groupBoardPostIts)
              .where(eq(groupBoardPostIts.id, Number(msg.postitId)));
            break;

          case 'comment:add':
            await db.insert(groupBoardComments).values({
              configId,
              groupNumber: Number(msg.groupNumber),
              type: 'text',
              content: String(msg.content),
              authorName: msg.authorName || 'Trainer',
            });
            break;

          case 'comment:delete':
            await db.delete(groupBoardComments)
              .where(eq(groupBoardComments.id, Number(msg.commentId)));
            break;
        }

        await broadcastBoardState(configId);
      } catch (e) {
        console.error('GroupBoard WS error:', e);
      }
    });

    ws.on('close', () => {
      if (configId) rooms.get(configId)?.delete(ws);
    });
  });
}
