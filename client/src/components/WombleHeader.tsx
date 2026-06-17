import React from 'react';

export const WombleHeader: React.FC = () => {
  return (
    <div className="w-full px-4 py-3 border-b bg-card">
      <a
        href="https://womblefeedback.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 group rounded-md px-1 py-1 hover:bg-accent transition-colors"
      >
        <img src="/womble-icon.svg" alt="Womble" className="h-8 w-8" />
        <span className="text-lg font-bold text-primary transition-colors">
          Womble
        </span>
      </a>
    </div>
  );
};

export default WombleHeader;
