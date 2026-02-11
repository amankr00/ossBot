import React, { useState, useEffect } from "react";

const Typewriter = ({ text = "", speed = 25, onComplete }) => {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    if (!text) return;

    setDisplayedText(""); // reset when new text arrives
    let i = 0;
    
    // setInterval used for showing effect after some time. Which will create a typing effect.
    const interval = setInterval(() => {
      setDisplayedText((prev) => prev + text.charAt(i));
      i++;

      if (i >= text.length) {
        clearInterval(interval);
        if (onComplete) onComplete(); 
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, onComplete]); // If the text or speed changes the useEffect will run again.

  return <span>{displayedText}</span>;
};

export default Typewriter;
