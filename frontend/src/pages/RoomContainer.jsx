import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import JoinRoom from './JoinRoom';
import Room from './Room';

export default function RoomContainer() {
  const { roomId } = useParams();
  const [displayName, setDisplayName] = useState(() => sessionStorage.getItem('displayName') || '');

  const handleJoin = (name) => {
    sessionStorage.setItem('displayName', name);
    setDisplayName(name);
  };

  if (!displayName) {
    return <JoinRoom roomId={roomId} onJoin={handleJoin} />;
  }

  return <Room roomId={roomId} displayName={displayName} />;
}
