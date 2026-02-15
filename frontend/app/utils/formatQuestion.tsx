import React from 'react';

export function formatQuestion(question: string): React.ReactNode {
  // "hackathon" düzeltmesi
  if (question.includes('Referandium to win hackathon')) {
    return question.replace('Referandium to win hackathon', 'Referandium to win Pump.fun hackathon');
  }

  // "Bitcoin Reserve" düzeltmesi
  if (!question.includes('Bitcoin')) return question;

  let text = question.replace('Is Trump going to establish a', 'I want Trump going to establish a').replace(/\?$/, '.');
  const parts = text.split('Bitcoin');
  return (
    <>
      {parts[0]}
      <span className="line-through decoration-red-500 decoration-2 text-gray-400">Bitcoin</span>{' '}
      <span className="text-blue-600 font-bold">Referandium</span>
      {parts[1]}
    </>
  );
}
