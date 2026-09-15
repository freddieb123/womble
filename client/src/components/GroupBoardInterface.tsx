import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Plus, X, MessageSquare, Trash2, Edit2, Check } from "lucide-react";
import type { AdminConfig, GroupBoardSettings } from "@/lib/types";

interface PostIt {
  id: number;
  configId: number;
  groupNumber: number;
  authorName: string;
  text: string;
  color: string;
  posX: number;
  posY: number;
  isTrainer: boolean;
}

interface BoardComment {
  id: number;
  configId: number;
  groupNumber: number;
  type: 'text' | 'voice';
  content: string | null;
  audioUrl: string | null;
  authorName: string | null;
}

interface Props {
  config: AdminConfig;
  userName: string | null;
  onUserNameSubmit?: (name: string) => void;
  isAdmin?: boolean;
}

const COLORS = [
  { label: 'Yellow', value: '#FBEBC4' },
  { label: 'Pink', value: '#FFE3FB' },
  { label: 'Blue', value: '#D6F0FF' },
  { label: 'Green', value: '#D8F6DE' },
  { label: 'Purple', value: '#F1E7FF' },
  { label: 'White', value: '#FBFAF7' },
];

export default function GroupBoardInterface({ config, userName, onUserNameSubmit, isAdmin = false }: Props) {
  const settings: GroupBoardSettings = config.groupBoardSettings ?? { numGroups: 4, showOtherGroups: true };
  const numGroups = settings.numGroups ?? 4;
  const showOtherGroups = settings.showOtherGroups !== false;

  const groupLabels = Array.from({ length: numGroups }, (_, i) =>
    settings.groupLabels?.[i] ?? `Group ${i + 1}`
  );

  const [groupNumber, setGroupNumber] = useState<number | null>(isAdmin ? 0 : null);
  const [postIts, setPostIts] = useState<PostIt[]>([]);
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Add post-it flow
  const [addingToGroup, setAddingToGroup] = useState<number | null>(null);
  const [pendingPos, setPendingPos] = useState({ posX: 10, posY: 10 });
  const [newText, setNewText] = useState('');
  const [newColor, setNewColor] = useState('#FBEBC4');

  // Edit post-it
  const [editingPostIt, setEditingPostIt] = useState<PostIt | null>(null);
  const [editText, setEditText] = useState('');

  // Add comment (admin)
  const [commentingGroup, setCommentingGroup] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');

  // Name entry (if participant and no name)
  const [nameInput, setNameInput] = useState('');

  const zoneRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws/group-board`);
    wsRef.current = socket;
    setWs(socket);

    socket.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'board:state') {
        setPostIts(msg.postIts ?? []);
        setComments(msg.comments ?? []);
      }
    };

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'join', configId: config.id }));
    };

    return () => {
      socket.close();
      wsRef.current = null;
    };
  }, [config.id]);

  const handleZoneClick = (e: React.MouseEvent<HTMLDivElement>, groupNum: number) => {
    if (!isAdmin && groupNum !== groupNumber) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const posX = Math.max(0, Math.min(85, ((e.clientX - rect.left) / rect.width) * 100));
    const posY = Math.max(0, Math.min(85, ((e.clientY - rect.top) / rect.height) * 100));
    setPendingPos({ posX: Math.round(posX), posY: Math.round(posY) });
    setNewText('');
    setNewColor('#FBEBC4');
    setAddingToGroup(groupNum);
  };

  const handleAddPostIt = () => {
    if (!newText.trim() || addingToGroup === null) return;
    send({
      type: 'postit:add',
      groupNumber: addingToGroup,
      authorName: isAdmin ? 'Trainer' : (userName || 'Anonymous'),
      text: newText.trim(),
      color: newColor,
      posX: pendingPos.posX,
      posY: pendingPos.posY,
      isTrainer: isAdmin,
    });
    setAddingToGroup(null);
    setNewText('');
  };

  const handleEditSave = () => {
    if (!editingPostIt || !editText.trim()) return;
    setPostIts(prev => prev.map(p => p.id === editingPostIt.id ? { ...p, text: editText } : p));
    send({ type: 'postit:edit', postitId: editingPostIt.id, text: editText.trim() });
    setEditingPostIt(null);
  };

  const handleDeletePostIt = (postit: PostIt) => {
    setPostIts(prev => prev.filter(p => p.id !== postit.id));
    send({ type: 'postit:delete', postitId: postit.id });
    setEditingPostIt(null);
  };

  const handleAddComment = () => {
    if (!commentText.trim() || commentingGroup === null) return;
    send({
      type: 'comment:add',
      groupNumber: commentingGroup,
      content: commentText.trim(),
      authorName: 'Trainer',
    });
    setCommentingGroup(null);
    setCommentText('');
  };

  const handleDeleteComment = (comment: BoardComment) => {
    setComments(prev => prev.filter(c => c.id !== comment.id));
    send({ type: 'comment:delete', commentId: comment.id });
  };

  // Post-it drag
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, postit: PostIt) => {
    const canInteract = isAdmin || postit.groupNumber === groupNumber;
    if (!canInteract) return;
    e.preventDefault();
    e.stopPropagation();

    const zone = zoneRefs.current[postit.groupNumber];
    if (!zone) return;
    const zoneRect = zone.getBoundingClientRect();

    let startX = e.clientX;
    let startY = e.clientY;
    let curPosX = postit.posX;
    let curPosY = postit.posY;
    let totalMove = 0;
    let dragging = false;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      totalMove += Math.abs(dx) + Math.abs(dy);
      if (totalMove > 5) dragging = true;
      if (!dragging) return;

      const newX = Math.max(0, Math.min(85, curPosX + (dx / zoneRect.width) * 100));
      const newY = Math.max(0, Math.min(85, curPosY + (dy / zoneRect.height) * 100));
      setPostIts(prev => prev.map(p => p.id === postit.id ? { ...p, posX: newX, posY: newY } : p));
      startX = ev.clientX;
      startY = ev.clientY;
      curPosX = newX;
      curPosY = newY;
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (dragging) {
        send({ type: 'postit:move', postitId: postit.id, posX: Math.round(curPosX), posY: Math.round(curPosY) });
      } else {
        setEditingPostIt(postit);
        setEditText(postit.text);
      }
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  // ── Name entry ───────────────────────────────────────────────────────────────
  if (!isAdmin && !userName) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
        <p className="text-lg font-semibold text-gray-800">{config.title}</p>
        <p className="text-sm text-gray-500">Enter your name to join the board</p>
        <div className="flex gap-2">
          <input
            className="border rounded px-3 py-2 text-sm w-48"
            placeholder="Your name"
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && nameInput.trim()) onUserNameSubmit?.(nameInput.trim()); }}
            autoFocus
          />
          <Button onClick={() => nameInput.trim() && onUserNameSubmit?.(nameInput.trim())} size="sm">
            Join
          </Button>
        </div>
      </div>
    );
  }

  // ── Group picker ─────────────────────────────────────────────────────────────
  if (!isAdmin && groupNumber === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 py-12">
        <p className="text-lg font-semibold text-gray-800">Which group are you in?</p>
        <div className="flex flex-wrap gap-3 justify-center">
          {groupLabels.map((label, i) => (
            <button
              key={i}
              onClick={() => setGroupNumber(i)}
              className="px-5 py-3 rounded-lg border-2 border-gray-200 bg-white hover:border-green-400 hover:bg-green-50 text-sm font-medium text-gray-700 transition-colors"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const myGroupComments = (gNum: number) => comments.filter(c => c.groupNumber === gNum);
  const myGroupPostIts = (gNum: number) => postIts.filter(p => p.groupNumber === gNum);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{config.title}</h2>
            {settings.boardInstructions && (
              <p className="text-xs text-gray-500 mt-0.5">{settings.boardInstructions}</p>
            )}
          </div>
          {!isAdmin && groupNumber !== null && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
              {groupLabels[groupNumber]}
            </span>
          )}
        </div>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto p-4">
        <div className={`grid gap-4 ${numGroups <= 2 ? 'grid-cols-1 md:grid-cols-2' : numGroups <= 4 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'}`}>
          {groupLabels.map((label, gIdx) => {
            const isOwn = isAdmin || gIdx === groupNumber;
            const visible = isAdmin || isOwn || showOtherGroups;
            const groupPostIts = myGroupPostIts(gIdx);
            const groupComments = myGroupComments(gIdx);

            return (
              <div
                key={gIdx}
                className={`border rounded-lg overflow-hidden ${isOwn ? 'border-green-300 shadow-sm' : 'border-gray-200'} ${!visible ? 'opacity-30 pointer-events-none' : ''}`}
              >
                {/* Zone header */}
                <div className={`flex items-center justify-between px-3 py-2 ${isOwn ? 'bg-green-50' : 'bg-gray-50'} border-b`}>
                  <span className="text-xs font-semibold text-gray-700">{label}</span>
                  <div className="flex items-center gap-1">
                    {isOwn && (
                      <button
                        onClick={() => {
                          setPendingPos({ posX: 10, posY: 10 });
                          setNewText('');
                          setNewColor('#FBEBC4');
                          setAddingToGroup(gIdx);
                        }}
                        className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 px-1.5 py-0.5 rounded hover:bg-green-100"
                      >
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => { setCommentingGroup(gIdx); setCommentText(''); }}
                        className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 px-1.5 py-0.5 rounded hover:bg-blue-50"
                      >
                        <MessageSquare className="h-3 w-3" /> Comment
                      </button>
                    )}
                  </div>
                </div>

                {/* Trainer comments */}
                {groupComments.map(c => (
                  <div key={c.id} className="mx-3 mt-2 bg-blue-50 border border-blue-200 rounded px-3 py-2 text-xs text-blue-800">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="font-semibold">{c.authorName || 'Trainer'}: </span>
                        {c.type === 'voice' && c.audioUrl ? (
                          <audio controls src={c.audioUrl} className="h-6 mt-1" />
                        ) : (
                          <span>{c.content}</span>
                        )}
                      </div>
                      {isAdmin && (
                        <button onClick={() => handleDeleteComment(c)} className="flex-shrink-0 text-blue-400 hover:text-blue-700">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Post-it canvas */}
                <div
                  ref={el => { zoneRefs.current[gIdx] = el; }}
                  className="relative min-h-[280px] bg-amber-50/30 cursor-crosshair select-none"
                  onClick={isOwn ? (e) => handleZoneClick(e, gIdx) : undefined}
                >
                  {groupPostIts.length === 0 && (
                    <p className="absolute inset-0 flex items-center justify-center text-xs text-gray-300 pointer-events-none">
                      {isOwn ? 'Click to add a post-it' : 'No post-its yet'}
                    </p>
                  )}
                  {groupPostIts.map(p => (
                    <div
                      key={p.id}
                      onPointerDown={(e) => handlePointerDown(e, p)}
                      style={{
                        position: 'absolute',
                        left: `${p.posX}%`,
                        top: `${p.posY}%`,
                        backgroundColor: p.color,
                        cursor: (isAdmin || p.groupNumber === groupNumber) ? 'grab' : 'default',
                        zIndex: 10,
                      }}
                      className="w-28 min-h-[5rem] rounded shadow-md p-2 text-xs text-gray-800 overflow-hidden"
                    >
                      {p.isTrainer && (
                        <div className="text-[10px] font-bold text-blue-600 mb-0.5">Trainer</div>
                      )}
                      <p className="break-words leading-snug">{p.text}</p>
                      <p className="text-[10px] text-gray-500 mt-1 truncate">{p.authorName}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add post-it modal */}
      {addingToGroup !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setAddingToGroup(null)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3 text-gray-800">
              Add post-it to {groupLabels[addingToGroup]}
            </h3>
            <textarea
              className="w-full border rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
              rows={3}
              placeholder="What's your idea?"
              value={newText}
              onChange={e => setNewText(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleAddPostIt(); }}
            />
            <div className="flex gap-1.5 mt-2 mb-3">
              {COLORS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setNewColor(c.value)}
                  title={c.label}
                  style={{ backgroundColor: c.value }}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${newColor === c.value ? 'border-gray-700 scale-110' : 'border-gray-200'}`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleAddPostIt} disabled={!newText.trim()}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingToGroup(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit post-it modal */}
      {editingPostIt && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setEditingPostIt(null)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3 text-gray-800">Edit post-it</h3>
            <textarea
              className="w-full border rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-300"
              rows={3}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleEditSave} disabled={!editText.trim()}>
                <Check className="h-3 w-3 mr-1" /> Save
              </Button>
              <Button size="sm" variant="destructive" onClick={() => handleDeletePostIt(editingPostIt)}>
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingPostIt(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Add comment modal (admin) */}
      {commentingGroup !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setCommentingGroup(null)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-80" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-3 text-gray-800">
              Comment for {groupLabels[commentingGroup]}
            </h3>
            <textarea
              className="w-full border rounded p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
              rows={3}
              placeholder="Your feedback for this group..."
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleAddComment} disabled={!commentText.trim()}>Add comment</Button>
              <Button size="sm" variant="ghost" onClick={() => setCommentingGroup(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
