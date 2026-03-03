import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/Icons';
import api from '../api/client';
import { userApi } from '../api/client';

export default function Messages() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [conversations, setConversations] = useState([]);
    const [activeConv, setActiveConv] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMsg, setNewMsg] = useState('');
    const [loading, setLoading] = useState(true);
    const [msgLoading, setMsgLoading] = useState(false);
    const [error, setError] = useState('');
    const [sending, setSending] = useState(false);

    // Avatar cache
    const [avatarCache, setAvatarCache] = useState({});

    // New conversation
    const [showNew, setShowNew] = useState(false);
    const [searchUser, setSearchUser] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [chatMode, setChatMode] = useState('direct'); // 'direct' | 'group'
    const [selectedMembers, setSelectedMembers] = useState([]);
    const [groupName, setGroupName] = useState('');

    const messagesEndRef = useRef(null);
    const pollRef = useRef(null);
    const [searchParams, setSearchParams] = useSearchParams();
    const autoOpenHandled = useRef(false);

    // Load avatar for a user
    const loadAvatar = async (userId) => {
        if (avatarCache[userId] !== undefined) return;
        setAvatarCache(prev => ({ ...prev, [userId]: null })); // mark as loading
        const url = await userApi.getUserAvatarBlob(userId);
        setAvatarCache(prev => ({ ...prev, [userId]: url }));
    };

    // Get the other person in a direct convo
    const getOther = (conv) => {
        const other = conv.members?.find(m => m.user_id !== user?.id);
        return other || { user_id: null, name: 'Unknown' };
    };

    // Fetch conversations
    useEffect(() => {
        const fetch = async () => {
            try {
                const { data } = await api.get('/messages/conversations');
                setConversations(data);

                // Load avatars for direct conversations
                data.forEach(conv => {
                    if (conv.type === 'direct') {
                        const other = conv.members?.find(m => m.user_id !== user?.id);
                        if (other) loadAvatar(other.user_id);
                    }
                });

                // Auto-open conversation if ?user= is in the URL
                const targetUserId = searchParams.get('user');
                if (targetUserId && !autoOpenHandled.current) {
                    autoOpenHandled.current = true;
                    const existing = data.find(c =>
                        c.type === 'direct' && c.members?.some(m => m.user_id === targetUserId)
                    );
                    if (existing) {
                        setActiveConv(existing);
                    } else {
                        try {
                            const { data: newConv } = await api.post('/messages/conversations/direct', {
                                target_user_id: targetUserId,
                            });
                            setConversations(prev => [newConv, ...prev]);
                            setActiveConv(newConv);
                        } catch { /* ignore */ }
                    }
                    setSearchParams({}, { replace: true });
                }
            } catch {
                setError('Failed to load conversations');
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    // Fetch messages for active conversation
    useEffect(() => {
        if (!activeConv) return;
        const fetchMessages = async () => {
            setMsgLoading(true);
            try {
                const { data } = await api.get(`/messages/conversations/${activeConv.id}/messages`);
                setMessages(data.messages);
                // Mark conversation as read locally
                setConversations(prev => prev.map(c =>
                    c.id === activeConv.id ? { ...c, unread_count: 0 } : c
                ));
            } catch {
                setError('Failed to load messages');
            } finally {
                setMsgLoading(false);
            }
        };
        fetchMessages();

        // Poll for new messages every 3 seconds
        pollRef.current = setInterval(async () => {
            try {
                const { data } = await api.get(`/messages/conversations/${activeConv.id}/messages`);
                setMessages(data.messages);
            } catch { /* ignore */ }
        }, 3000);

        return () => clearInterval(pollRef.current);
    }, [activeConv?.id]);

    // Scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!newMsg.trim() || !activeConv) return;
        setSending(true);
        try {
            const { data } = await api.post(`/messages/conversations/${activeConv.id}/messages`, {
                encrypted_content: newMsg,
            });
            setMessages(prev => [...prev, data]);
            setNewMsg('');
        } catch {
            setError('Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const handleStartConversation = async (targetUserId) => {
        if (chatMode === 'group') {
            // In group mode, add user to selected members
            const userObj = searchResults.find(u => u.id === targetUserId);
            if (userObj && !selectedMembers.some(m => m.id === targetUserId)) {
                setSelectedMembers(prev => [...prev, userObj]);
            }
            setSearchUser('');
            setSearchResults([]);
            return;
        }
        // Direct mode — start 1:1 conversation
        try {
            const { data } = await api.post('/messages/conversations/direct', {
                target_user_id: targetUserId,
            });
            setConversations(prev => {
                if (prev.some(c => c.id === data.id)) return prev;
                return [data, ...prev];
            });
            setActiveConv(data);
            setShowNew(false);
            setSearchUser('');
            setSearchResults([]);
            loadAvatar(targetUserId);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to start conversation');
        }
    };

    const handleCreateGroup = async () => {
        if (selectedMembers.length < 1) return;
        const name = groupName.trim() || selectedMembers.map(m => m.full_name || m.email).join(', ');
        try {
            const { data } = await api.post('/messages/conversations/group', {
                name,
                member_ids: selectedMembers.map(m => m.id),
            });
            setConversations(prev => [data, ...prev]);
            setActiveConv(data);
            setShowNew(false);
            setSearchUser('');
            setSearchResults([]);
            setSelectedMembers([]);
            setGroupName('');
            setChatMode('direct');
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to create group');
        }
    };

    const handleRemoveMember = (id) => {
        setSelectedMembers(prev => prev.filter(m => m.id !== id));
    };

    const handleSearchUsers = async (query) => {
        setSearchUser(query);
        if (query.length < 2) { setSearchResults([]); return; }
        try {
            const { data } = await api.get('/users/search', { params: { q: query } });
            setSearchResults((data.users || data || []).filter(u => u.id !== user?.id));
        } catch { /* ignore */ }
    };

    const convName = (conv) => {
        if (conv.name) return conv.name;
        const other = conv.members?.find(m => m.user_id !== user?.id);
        return other?.name || 'Unknown';
    };

    const convInitial = (conv) => convName(conv).charAt(0).toUpperCase();

    if (loading) return <div className="page"><div className="empty-state"><div className="spinner" /></div></div>;

    return (
        <div className="page" style={{ height: 'calc(100vh - 120px)' }}>
            <div style={{
                display: 'grid', gridTemplateColumns: '300px 1fr',
                gap: 0, height: '100%', borderRadius: 'var(--radius)', overflow: 'hidden',
                border: '1px solid var(--border)', minHeight: 0,
            }}>
                {/* Sidebar */}
                <div style={{ background: 'var(--bg-glass)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2><Icon name="mail" size={18} /> Messages</h2>
                        <button className="btn btn-ghost btn-xs" onClick={() => setShowNew(!showNew)}>
                            <Icon name="plus" size={14} />
                        </button>
                    </div>

                    {showNew && (
                        <div style={{ padding: '0.75rem', borderBottom: '1px solid var(--border)' }}>
                            {/* Mode toggle */}
                            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem', background: 'var(--input-bg)', borderRadius: 'var(--radius-xs)', padding: '0.2rem' }}>
                                <button
                                    onClick={() => { setChatMode('direct'); setSelectedMembers([]); setGroupName(''); }}
                                    style={{
                                        flex: 1, padding: '0.35rem', border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                                        fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.2s',
                                        background: chatMode === 'direct' ? 'var(--primary)' : 'transparent',
                                        color: chatMode === 'direct' ? '#fff' : 'var(--text-muted)',
                                    }}
                                >
                                    <Icon name="mail" size={11} /> Direct
                                </button>
                                <button
                                    onClick={() => setChatMode('group')}
                                    style={{
                                        flex: 1, padding: '0.35rem', border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
                                        fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.2s',
                                        background: chatMode === 'group' ? 'var(--primary)' : 'transparent',
                                        color: chatMode === 'group' ? '#fff' : 'var(--text-muted)',
                                    }}
                                >
                                    <Icon name="users" size={11} /> Group
                                </button>
                            </div>

                            {/* Group name input */}
                            {chatMode === 'group' && (
                                <input
                                    type="text" placeholder="Group name (optional)"
                                    value={groupName} onChange={(e) => setGroupName(e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', color: 'var(--text)', fontSize: '0.85rem', marginBottom: '0.5rem' }}
                                />
                            )}

                            {/* Selected members chips */}
                            {chatMode === 'group' && selectedMembers.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginBottom: '0.5rem' }}>
                                    {selectedMembers.map(m => (
                                        <span key={m.id} style={{
                                            display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                                            padding: '0.2rem 0.5rem', borderRadius: '12px',
                                            background: 'var(--primary-subtle)', color: 'var(--primary)',
                                            fontSize: '0.75rem', fontWeight: 500,
                                        }}>
                                            {m.full_name || m.email}
                                            <span
                                                onClick={() => handleRemoveMember(m.id)}
                                                style={{ cursor: 'pointer', marginLeft: '0.15rem', fontWeight: 700, fontSize: '0.85rem', lineHeight: 1 }}
                                            >×</span>
                                        </span>
                                    ))}
                                </div>
                            )}

                            {/* User search */}
                            <input
                                type="text" placeholder="Search users..."
                                value={searchUser} onChange={(e) => handleSearchUsers(e.target.value)}
                                style={{ width: '100%', padding: '0.5rem', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', color: 'var(--text)', fontSize: '0.85rem' }}
                            />
                            {searchResults.length > 0 && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', maxHeight: '150px', overflowY: 'auto' }}>
                                    {searchResults.filter(u => !selectedMembers.some(m => m.id === u.id)).map(u => (
                                        <div
                                            key={u.id}
                                            onClick={() => handleStartConversation(u.id)}
                                            style={{ padding: '0.4rem 0.5rem', cursor: 'pointer', borderRadius: 'var(--radius-xs)', transition: 'background 0.2s' }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--primary-subtle)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                        >
                                            {u.full_name || u.email}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Create group button */}
                            {chatMode === 'group' && selectedMembers.length > 0 && (
                                <button
                                    onClick={handleCreateGroup}
                                    className="btn btn-primary btn-sm btn-full"
                                    style={{ marginTop: '0.5rem' }}
                                >
                                    <Icon name="users" size={13} /> Create Group ({selectedMembers.length} member{selectedMembers.length !== 1 ? 's' : ''})
                                </button>
                            )}
                        </div>
                    )}

                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {conversations.length === 0 ? (
                            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No conversations yet
                            </div>
                        ) : (
                            conversations.map(conv => {
                                const other = getOther(conv);
                                const avatar = conv.type === 'direct' ? avatarCache[other.user_id] : null;
                                return (
                                    <div
                                        key={conv.id}
                                        onClick={() => setActiveConv(conv)}
                                        style={{
                                            padding: '0.75rem 1rem', cursor: 'pointer',
                                            borderBottom: '1px solid var(--border)',
                                            background: activeConv?.id === conv.id ? 'var(--primary-subtle)' : 'transparent',
                                            transition: 'background 0.15s',
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            {/* Avatar */}
                                            <div style={{
                                                width: 40, height: 40, borderRadius: '50%',
                                                background: conv.type === 'direct' ? 'linear-gradient(135deg, var(--primary), var(--accent))' : 'linear-gradient(135deg, var(--success), #10b981)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontWeight: 600, fontSize: '0.85rem', flexShrink: 0,
                                                overflow: 'hidden', cursor: conv.type === 'direct' ? 'pointer' : 'default',
                                                position: 'relative',
                                            }} onClick={(e) => { if (conv.type === 'direct' && other.user_id) { e.stopPropagation(); navigate(`/users/${other.user_id}`); } }}>
                                                {avatar
                                                    ? <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    : conv.type === 'group' ? <Icon name="users" size={16} /> : convInitial(conv)
                                                }
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                                    <div
                                                        style={{
                                                            fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-heading)',
                                                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                            cursor: conv.type === 'direct' ? 'pointer' : 'default', flex: 1,
                                                        }}
                                                        onClick={(e) => { if (conv.type === 'direct' && other.user_id) { e.stopPropagation(); navigate(`/users/${other.user_id}`); } }}
                                                    >
                                                        {convName(conv)}
                                                    </div>
                                                    {/* Unread badge */}
                                                    {conv.unread_count > 0 && (
                                                        <span style={{
                                                            background: 'var(--primary)', color: '#fff',
                                                            borderRadius: '10px', padding: '0.1rem 0.45rem',
                                                            fontSize: '0.7rem', fontWeight: 700,
                                                            minWidth: 18, textAlign: 'center', flexShrink: 0,
                                                        }}>
                                                            {conv.unread_count > 99 ? '99+' : conv.unread_count}
                                                        </span>
                                                    )}
                                                </div>
                                                {conv.last_message && (
                                                    <div style={{ fontSize: '0.78rem', color: conv.unread_count > 0 ? 'var(--text-heading)' : 'var(--text-muted)', fontWeight: conv.unread_count > 0 ? 500 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {conv.last_message.sender_name}: {conv.last_message.preview}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Chat Area */}
                <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-alt)', minHeight: 0, overflow: 'hidden' }}>
                    {!activeConv ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem' }}>
                            <Icon name="mail" size={48} style={{ opacity: 0.2 }} />
                            <p className="text-muted">Select a conversation or start a new one</p>
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', background: 'var(--bg-glass)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div style={{
                                    width: 36, height: 36, borderRadius: '50%',
                                    background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#fff', fontWeight: 600, fontSize: '0.82rem',
                                    overflow: 'hidden', cursor: activeConv.type === 'direct' ? 'pointer' : 'default',
                                }} onClick={() => { if (activeConv.type === 'direct') { const o = getOther(activeConv); if (o.user_id) navigate(`/users/${o.user_id}`); } }}>
                                    {(() => {
                                        const o = getOther(activeConv);
                                        const av = activeConv.type === 'direct' ? avatarCache[o.user_id] : null;
                                        if (av) return <img src={av} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />;
                                        return convInitial(activeConv);
                                    })()}
                                </div>
                                <div>
                                    <div
                                        style={{ fontWeight: 600, color: 'var(--text-heading)', cursor: activeConv.type === 'direct' ? 'pointer' : 'default' }}
                                        onClick={() => { if (activeConv.type === 'direct') { const o = getOther(activeConv); if (o.user_id) navigate(`/users/${o.user_id}`); } }}
                                    >
                                        {convName(activeConv)}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {activeConv.type === 'direct' ? (
                                            <><Icon name="lock" size={10} /> End-to-end encrypted</>
                                        ) : (
                                            <><Icon name="shieldCheck" size={10} /> Encrypted at rest</>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Messages */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {error && <div className="alert alert-error">{error}</div>}
                                {msgLoading ? (
                                    <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" /></div>
                                ) : messages.length === 0 ? (
                                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '3rem', fontSize: '0.85rem' }}>
                                        <Icon name="shieldCheck" size={24} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block', margin: '0 auto 0.5rem' }} />
                                        Start of encrypted conversation
                                    </div>
                                ) : (
                                    messages.map(msg => {
                                        const isMe = msg.sender_id === user?.id;
                                        return (
                                            <div key={msg.id} style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                                                <div style={{
                                                    maxWidth: '70%', padding: '0.6rem 0.9rem',
                                                    borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                                                    background: isMe ? 'linear-gradient(135deg, var(--primary), #7c3aed)' : 'var(--bg-glass)',
                                                    color: isMe ? '#fff' : 'var(--text)',
                                                    border: isMe ? 'none' : '1px solid var(--border)',
                                                    boxShadow: isMe ? '0 2px 8px rgba(99,102,241,0.3)' : 'var(--card-shadow)',
                                                }}>
                                                    {!isMe && (
                                                        <div
                                                            style={{ fontSize: '0.72rem', fontWeight: 600, marginBottom: '0.2rem', color: 'var(--primary)', cursor: 'pointer' }}
                                                            onClick={() => navigate(`/users/${msg.sender_id}`)}
                                                        >
                                                            {msg.sender_name}
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: '0.88rem', lineHeight: 1.5, wordBreak: 'break-word' }}>
                                                        {msg.encrypted_content}
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', marginTop: '0.25rem', opacity: 0.6, textAlign: 'right' }}>
                                                        {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <form onSubmit={handleSend} style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', background: 'var(--bg-glass)', display: 'flex', gap: '0.5rem' }}>
                                <input
                                    type="text" value={newMsg} onChange={(e) => setNewMsg(e.target.value)}
                                    placeholder="Type a message..."
                                    style={{ flex: 1, padding: '0.6rem 0.9rem', background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: '20px', color: 'var(--text)', fontSize: '0.88rem' }}
                                    disabled={sending}
                                />
                                <button type="submit" className="btn btn-primary" disabled={sending || !newMsg.trim()} style={{ borderRadius: '50%', width: 40, height: 40, padding: 0 }}>
                                    <Icon name="arrowRight" size={16} />
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
