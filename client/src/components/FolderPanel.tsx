import { useState, useEffect, useRef } from "react";
import { Folder, ChevronRight, ChevronDown, Plus, Edit, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface FolderItem {
  id: string;
  name: string;
  gptIds: number[];
}

interface GptItem {
  id: number;
  title: string;
  type: 'chat' | 'upload' | 'quiz';
  deleted?: boolean;
  isTemplate?: boolean;
}

interface FolderPanelProps {
  gptItems: GptItem[];
  onGptFolderChange: (gptId: number, folderId: string | null) => void;
  isPinned: boolean;
  onPinChange: (isPinned: boolean) => void;
  isCollapsed: boolean;
  onCollapseChange: (isCollapsed: boolean) => void;
  folders: FolderItem[];
  onFoldersChange: (folders: FolderItem[]) => void;
}

export default function FolderPanel({
  gptItems,
  onGptFolderChange,
  isPinned,
  onPinChange,
  isCollapsed,
  onCollapseChange,
  folders,
  onFoldersChange
}: FolderPanelProps) {
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [draggedGptId, setDraggedGptId] = useState<number | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const editFolderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isCreatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [isCreatingFolder]);

  useEffect(() => {
    if (editingFolderId && editFolderInputRef.current) {
      editFolderInputRef.current.focus();
    }
  }, [editingFolderId]);

  const handleToggleExpand = (folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const handleAddFolder = () => {
    if (newFolderName.trim()) {
      const newFolder: FolderItem = {
        id: `folder-${Date.now()}`,
        name: newFolderName.trim(),
        gptIds: []
      };
      onFoldersChange([...folders, newFolder]);
      setNewFolderName("");
      setIsCreatingFolder(false);
      setExpandedFolders(prev => {
        const newSet = new Set(prev);
        newSet.add(newFolder.id);
        return newSet;
      });
    }
  };

  const handleEditFolder = (folderId: string, newName: string) => {
    if (newName.trim()) {
      onFoldersChange(
        folders.map(f => 
          f.id === folderId ? { ...f, name: newName.trim() } : f
        )
      );
      setEditingFolderId(null);
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    // Find the folder to get its GPTs
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      // Update all GPTs in this folder to have no folder
      folder.gptIds.forEach(gptId => {
        onGptFolderChange(gptId, null);
      });
    }
    
    // Remove the folder
    onFoldersChange(folders.filter(f => f.id !== folderId));
  };

  const handleDragStart = (gptId: number) => {
    setDraggedGptId(gptId);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    setDragOverFolderId(folderId);
  };

  const handleDrop = (e: React.DragEvent, folderId: string | null) => {
    e.preventDefault();
    if (draggedGptId !== null) {
      onGptFolderChange(draggedGptId, folderId);
      
      // Update folders state to reflect the change
      if (folderId) {
        // Add to this folder
        onFoldersChange(
          folders.map(f => {
            if (f.id === folderId) {
              // Add to this folder if not already there
              if (!f.gptIds.includes(draggedGptId)) {
                return { ...f, gptIds: [...f.gptIds, draggedGptId] };
              }
            } else {
              // Remove from other folders
              return { ...f, gptIds: f.gptIds.filter(id => id !== draggedGptId) };
            }
            return f;
          })
        );
      } else {
        // Remove from all folders
        onFoldersChange(
          folders.map(f => ({
            ...f,
            gptIds: f.gptIds.filter(id => id !== draggedGptId)
          }))
        );
      }
    }
    setDraggedGptId(null);
    setDragOverFolderId(null);
  };

  // Calculate which GPTs don't belong to any folder
  const unorganizedGptIds = gptItems
    .filter(gpt => !gpt.deleted && !gpt.isTemplate)
    .map(gpt => gpt.id)
    .filter(id => !folders.some(folder => folder.gptIds.includes(id)));

  return (
    <div 
      className={cn(
        "border-r border-gray-200 transition-all duration-300",
        isCollapsed ? "w-12" : "w-64",
        isPinned ? "sticky top-0 h-[calc(100vh-4rem)]" : "h-full"
      )}
    >
      <div className="flex justify-between items-center p-3 border-b border-gray-200">
        {!isCollapsed && <h3 className="font-semibold">Folders</h3>}
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => onCollapseChange(!isCollapsed)}
            className="h-8 w-8"
          >
            <ChevronRight className={cn(
              "h-4 w-4 transition-transform", 
              !isCollapsed && "rotate-180"
            )} />
          </Button>
          {!isCollapsed && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => onPinChange(!isPinned)}
              className="h-8 w-8"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                width="16" 
                height="16" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                className={cn("", isPinned && "fill-gray-400")}
              >
                <path d="m12 8-9 9 3 3 9-9-3-3z" />
                <path d="m16 12 5-5-3-3-5 5 3 3z" />
                <path d="M19 19H5" />
              </svg>
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-[calc(100%-3.5rem)]">
        {!isCollapsed && (
          <div className="p-3">
            {/* Add Folder Button */}
            {isCreatingFolder ? (
              <div className="mb-3 flex items-center">
                <Input
                  ref={newFolderInputRef}
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder="Folder name"
                  className="text-sm h-8 mr-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddFolder();
                    if (e.key === 'Escape') {
                      setIsCreatingFolder(false);
                      setNewFolderName("");
                    }
                  }}
                />
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={handleAddFolder}
                  disabled={!newFolderName.trim()}
                  className="h-8 min-w-8 px-2"
                >
                  Add
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCreatingFolder(true)}
                className="mb-3 w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Folder
              </Button>
            )}

            {/* Folders List */}
            <div className="space-y-1">
              {folders.map((folder) => (
                <div 
                  key={folder.id}
                  className={cn(
                    "rounded border transition-colors",
                    dragOverFolderId === folder.id ? "bg-blue-50 border-blue-200" : "border-transparent"
                  )}
                  onDragOver={(e) => handleDragOver(e, folder.id)}
                  onDrop={(e) => handleDrop(e, folder.id)}
                >
                  <div className="flex items-center py-1 px-2 hover:bg-gray-100 rounded">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleToggleExpand(folder.id)}
                      className="h-6 w-6 mr-1"
                    >
                      {expandedFolders.has(folder.id) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                    
                    <Folder className="h-4 w-4 text-blue-500 mr-2" />
                    
                    {editingFolderId === folder.id ? (
                      <Input
                        ref={editFolderInputRef}
                        defaultValue={folder.name}
                        className="text-sm h-7 mr-1 py-0 px-1 w-32"
                        onBlur={(e) => handleEditFolder(folder.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleEditFolder(folder.id, e.currentTarget.value);
                          if (e.key === 'Escape') setEditingFolderId(null);
                        }}
                      />
                    ) : (
                      <>
                        <span className="text-sm font-medium flex-grow truncate">{folder.name}</span>
                        <Badge variant="outline" className="ml-1 px-1 h-5 text-xs">
                          {folder.gptIds.length}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-1">
                              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                                <path d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM13.625 7.5C13.625 8.12132 13.1213 8.625 12.5 8.625C11.8787 8.625 11.375 8.12132 11.375 7.5C11.375 6.87868 11.8787 6.375 12.5 6.375C13.1213 6.375 13.625 6.87868 13.625 7.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
                              </svg>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditingFolderId(folder.id)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteFolder(folder.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                  </div>
                  
                  {expandedFolders.has(folder.id) && folder.gptIds.length > 0 && (
                    <div className="pl-7 py-1 space-y-1">
                      {folder.gptIds.map(gptId => {
                        const gpt = gptItems.find(g => g.id === gptId);
                        if (!gpt || gpt.deleted) return null;
                        
                        return (
                          <div 
                            key={gptId}
                            className="text-sm py-1 px-2 rounded hover:bg-gray-100 cursor-pointer flex items-center"
                            draggable
                            onDragStart={() => handleDragStart(gptId)}
                          >
                            <div className={cn(
                              "w-2 h-2 rounded-full mr-2",
                              gpt.type === 'chat' ? "bg-green-500" : 
                              gpt.type === 'upload' ? "bg-purple-500" : "bg-blue-500"
                            )} />
                            <span className="truncate">{gpt.title}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Unorganized GPTs section */}
              <div 
                className={cn(
                  "rounded border transition-colors mt-4",
                  dragOverFolderId === null ? "bg-blue-50 border-blue-200" : "border-transparent"
                )}
                onDragOver={(e) => handleDragOver(e, null)}
                onDrop={(e) => handleDrop(e, null)}
              >
                <div className="flex items-center py-1 px-2 hover:bg-gray-100 rounded">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => handleToggleExpand('unorganized')}
                    className="h-6 w-6 mr-1"
                  >
                    {expandedFolders.has('unorganized') ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </Button>
                  <span className="text-sm font-medium flex-grow">Unorganized</span>
                  <Badge variant="outline" className="ml-1 px-1 h-5 text-xs">
                    {unorganizedGptIds.length}
                  </Badge>
                </div>
                
                {expandedFolders.has('unorganized') && unorganizedGptIds.length > 0 && (
                  <div className="pl-7 py-1 space-y-1">
                    {unorganizedGptIds.map(gptId => {
                      const gpt = gptItems.find(g => g.id === gptId);
                      if (!gpt) return null;
                      
                      return (
                        <div 
                          key={gptId}
                          className="text-sm py-1 px-2 rounded hover:bg-gray-100 cursor-pointer flex items-center"
                          draggable
                          onDragStart={() => handleDragStart(gptId)}
                        >
                          <div className={cn(
                            "w-2 h-2 rounded-full mr-2",
                            gpt.type === 'chat' ? "bg-green-500" : 
                            gpt.type === 'upload' ? "bg-purple-500" : "bg-blue-500"
                          )} />
                          <span className="truncate">{gpt.title}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Collapsed View */}
        {isCollapsed && (
          <div className="flex flex-col items-center py-3 space-y-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsCreatingFolder(true)}
              className="h-8 w-8"
            >
              <Plus className="h-4 w-4" />
            </Button>
            
            {folders.map((folder) => (
              <Button
                key={folder.id}
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 relative", 
                  dragOverFolderId === folder.id && "bg-blue-100"
                )}
                onClick={() => {
                  onCollapseChange(false);
                  handleToggleExpand(folder.id);
                }}
                onDragOver={(e) => handleDragOver(e, folder.id)}
                onDrop={(e) => handleDrop(e, folder.id)}
              >
                <Folder className="h-4 w-4 text-blue-500" />
                {folder.gptIds.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {folder.gptIds.length}
                  </span>
                )}
              </Button>
            ))}
            
            {/* Unorganized section in collapsed view */}
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 relative mt-4", 
                dragOverFolderId === null && "bg-blue-100"
              )}
              onClick={() => {
                onCollapseChange(false);
                handleToggleExpand('unorganized');
              }}
              onDragOver={(e) => handleDragOver(e, null)}
              onDrop={(e) => handleDrop(e, null)}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4">
                <path d="M2.5 3C2.22386 3 2 3.22386 2 3.5V13.5C2 13.7761 2.22386 14 2.5 14H12.5C12.7761 14 13 13.7761 13 13.5V5.5C13 5.22386 12.7761 5 12.5 5H8.5C8.36739 5 8.24021 4.94732 8.14645 4.85355L6.85355 3.56066C6.75979 3.46689 6.63261 3.41421 6.5 3.41421H2.5V3ZM1 3.5C1 2.67157 1.67157 2 2.5 2H6.5C6.76522 2 7.01957 2.10536 7.20711 2.29289L8.5 3.58579C8.59379 3.67956 8.72097 3.73224 8.85358 3.73224H12.5C13.3284 3.73224 14 4.40381 14 5.23224V13.5C14 14.3284 13.3284 15 12.5 15H2.5C1.67157 15 1 14.3284 1 13.5V3.5Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
              </svg>
              {unorganizedGptIds.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-gray-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                  {unorganizedGptIds.length}
                </span>
              )}
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}