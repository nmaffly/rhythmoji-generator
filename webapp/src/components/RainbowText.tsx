import React from 'react';

interface RainbowTextProps {
  text: string;
  className?: string;
}

const RainbowText: React.FC<RainbowTextProps> = ({ text, className = '' }) => {
  const colors = [
    'text-red-500',    // R
    'text-orange-500', // h
    'text-yellow-500', // y
    'text-green-500',  // t
    'text-blue-500',   // h
    'text-indigo-500', // m
    'text-violet-500', // o
    'text-red-500',    // j
    'text-orange-500'  // i
  ];

  return (
    <span className={`font-bold ${className}`}>
      {text.split('').map((letter, index) => (
        <span
          key={index}
          className={`${colors[index % colors.length]} transition-all duration-300 hover:scale-110 inline-block`}
        >
          {letter}
        </span>
      ))}
    </span>
  );
};

export default RainbowText;