import React from 'react';

const SummaryModal = ({ isOpen, onClose, summaryData }) => {
    if (!isOpen || !summaryData) return null;

    return (
        <div className="modal show" onClick={(e) => e.target.classList.contains('modal') && onClose()}>
            <div className="modal-content" style={{ maxWidth: '500px', textAlign: 'left' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 'bold' }}>สรุปหัวข้อของแชทนี้</h3>
                    <i
                        className="fas fa-times"
                        onClick={onClose}
                        style={{ cursor: 'pointer', opacity: 0.7, fontSize: '1.2rem' }}
                    ></i>
                </div>

                <h4 style={{ marginBottom: '15px', color: 'var(--accent-color)', fontSize: '1.1rem' }}>
                    {summaryData.title}
                </h4>

                <div style={{ lineHeight: '1.6', marginBottom: '25px', fontSize: '1rem', whiteSpace: 'pre-wrap' }}>
                    {summaryData.summary}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '30px' }}>
                    {summaryData.topics && summaryData.topics.map((topic, i) => (
                        <span key={i} style={{
                            background: 'var(--hover-color)',
                            padding: '5px 10px',
                            borderRadius: '15px',
                            fontSize: '0.9rem',
                            color: 'var(--text-color)'
                        }}>
                            #{topic}
                        </span>
                    ))}
                </div>

                <button onClick={onClose} style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: 'var(--accent-color)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '5px',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                }}>
                    ปิด
                </button>
            </div>
        </div>
    );
};

export default SummaryModal;
