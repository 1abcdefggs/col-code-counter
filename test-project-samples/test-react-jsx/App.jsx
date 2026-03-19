/**
 * Code Count Sample File (React/JSX)
 * ---------------------------------------------------------
 * This file is used to verify line counting and discovery logic.
 * [Test Points]:
 * - Code: JSX elements and React component logic
 * - Comments: JSDoc style and single-line comments
 * ---------------------------------------------------------
 */

import React, { useState } from 'react';
import './App.css';

/**
 * Main Application Component
 * Tests JSX and ESM imports.
 */
function App() {
  const [count, setCount] = useState(0);

  // Increment logic
  const increment = () => {
    setCount(prev => prev + 1);
  };

  return (
    <div className="App">
      <h1>Code Count Test</h1>
      <p>Count is: {count}</p>
      <button onClick={increment}>
        Increment
      </button>
      {/* Test JSX Fragment and nested comments */}
      <>
        <span>Another element</span>
      </>
    </div>
  );
}

export default App;
