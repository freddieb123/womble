import { Message } from "@/lib/types";

interface Props {
  message: Message;
}

export default function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";

  // Handle both string and object content types
  const content = typeof message.content === 'string' 
    ? { text: message.content, image: null }
    : message.content;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-lg p-3 max-w-[80%] ${
          isUser
            ? "bg-blue-500 text-white"
            : "bg-gray-100 text-gray-900"
        }`}
      >
        {content.image && (
          <div className="mb-2">
            <img 
              src={content.image} 
              alt="Shared screenshot" 
              className="max-w-full rounded"
            />
          </div>
        )}
        {content.text}
      </div>
    </div>
  );
}