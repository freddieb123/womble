import React from 'react';

export const WombleHeader: React.FC = () => {
  return (
    <div className="w-full px-4 py-3 border-b border-gray-100 bg-white">
      <a
        href="https://womble.co"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 group"
      >
        <img src="/womble-icon.svg" alt="Womble" className="h-8 w-8" />
        <span className="text-lg font-bold text-green-700 group-hover:text-green-800 transition-colors">
          Womble
        </span>
      </a>
    </div>
  );
};

export default WombleHeader;
