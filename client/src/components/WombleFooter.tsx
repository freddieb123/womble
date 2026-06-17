import React from 'react';

export const WombleFooter: React.FC = () => {
  return (
    <div className="py-1.5 text-center text-xs text-gray-400 border-t border-gray-100">
      Enjoyed this activity?{' '}
      <a
        href="https://womblefeedback.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-green-600 hover:text-green-700 font-medium"
      >
        Create your own for free at womblefeedback.com
      </a>
    </div>
  );
};

export default WombleFooter;
