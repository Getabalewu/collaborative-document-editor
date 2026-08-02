import { useEffect, useState } from 'react';

export default function NotificationBar({ message, type = 'info', duration = 3000 }) {
  const [visible, setVisible] = useState(Boolean(message));

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timeout = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(timeout);
  }, [message, duration]);

  if (!message || !visible) return null;

  return (
    <div className={`notification notification-${type}`}>
      {message}
    </div>
  );
}
