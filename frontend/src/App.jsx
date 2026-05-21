import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import RoomContainer from './pages/RoomContainer';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/r/:roomId" element={<RoomContainer />} />
      </Routes>
    </Router>
  );
}

export default App;
