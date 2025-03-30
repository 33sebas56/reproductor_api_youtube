'use client';

import { useState, useEffect, useCallback } from "react";
import Image from 'next/image';

declare global {
  interface Window {
    YT: {
      Player: {
        new (elementId: string, options: any): {
          getCurrentTime: () => number;
          getDuration: () => number;
          getPlayerState: () => number;
          playVideo: () => void;
          pauseVideo: () => void;
          seekTo: (seconds: number, allowSeekAhead: boolean) => void;
          setVolume: (volume: number) => void;
        };
      };
      PlayerState: {
        ENDED: number;
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface AudioTrack {
  id: string;
  videoId: string;
  title: string;
  thumbnail: string;
}

interface FloatingAudio extends AudioTrack {
  x: number;
  y: number;
  player: YTPlayer | null;
  progress: number;
  duration: number;
  volume: number;
  isPlaying: boolean;
}

interface YTPlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
}

// Type for search results
interface SearchResult {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    thumbnails: {
      default: {
        url: string;
      };
    };
  };
}

export default function YouTubeAudioPlayer() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [floatingAudios, setFloatingAudios] = useState<FloatingAudio[]>([]);
  const [playlist, setPlaylist] = useState<AudioTrack[]>([]);
  const [history, setHistory] = useState<AudioTrack[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedPlaylist = localStorage.getItem('playlist');
    const savedHistory = localStorage.getItem('history');

    if (savedPlaylist) {
      setPlaylist(JSON.parse(savedPlaylist));
    }

    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('playlist', JSON.stringify(playlist));
  }, [playlist]);

  useEffect(() => {
    localStorage.setItem('history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    const loadYouTubeAPI = () => {
      if (window.YT) return;
  
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      tag.async = true;
  
      const scriptContainer = document.head || document.documentElement;
      scriptContainer.appendChild(tag);
  
      window.onYouTubeIframeAPIReady = () => {
        console.log("YouTube API is ready");
      };
    };
  
    loadYouTubeAPI();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setFloatingAudios((prev) =>
        prev.map((audio) => {
          try {
            if (audio.player && typeof audio.player.getCurrentTime === 'function') {
              const currentTime = audio.player.getCurrentTime();
              return {
                ...audio,
                progress: audio.duration > 0 
                  ? (currentTime / audio.duration) * 100 
                  : 0,
                isPlaying: audio.player.getPlayerState() === 1
              };
            }
          } catch (error) {
            console.error('Error actualizando progreso:', error);
          }
          return audio;
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [floatingAudios]);

  const searchVideo = async () => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setError('La búsqueda debe tener al menos 2 caracteres');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${trimmedQuery}&type=video&key=${apiKey}&maxResults=5`
      );
      
      if (!response.ok) {
        throw new Error('Error en la búsqueda de videos');
      }
      
      const data = await response.json();
      if (data.items && data.items.length > 0) {
        setResults(data.items as SearchResult[]);
      } else {
        setResults([]);
        setError('No se encontraron resultados');
      }
    } catch (err) {
      console.error('Error al buscar videos:', err);
      setError('No se pudo realizar la búsqueda. Inténtalo de nuevo.');
    } finally {
      setIsLoading(false);
    }
  };

  const playSelectedAudio = useCallback((audio: SearchResult) => {
    floatingAudios.forEach(existingAudio => {
      if (existingAudio.player && typeof existingAudio.player.pauseVideo === 'function') {
        existingAudio.player.pauseVideo();
      }
    });

    if (floatingAudios.length >= 5) {
      setError('Máximo de 5 audios simultáneos');
      return;
    }

    const newTrack: AudioTrack = {
      id: audio.id.videoId,
      videoId: audio.id.videoId,
      title: audio.snippet.title,
      thumbnail: audio.snippet.thumbnails.default.url
    };

    setHistory(prevHistory => {
      const filteredHistory = prevHistory.filter(track => track.id !== newTrack.id);
      return [newTrack, ...filteredHistory].slice(0, 10);
    });

    const newAudio: FloatingAudio = {
      ...newTrack,
      x: 100 + floatingAudios.length * 20,
      y: 100 + floatingAudios.length * 20,
      player: null,
      progress: 0,
      duration: 1,
      volume: 100,
      isPlaying: false
    };

    setFloatingAudios((prev) => 
      prev.filter(aud => aud.id !== newTrack.id).concat(newAudio)
    );

    setTimeout(() => {
      if (typeof window !== 'undefined' && window.YT) {
        // Usando guion bajo para indicar que la variable no se va a utilizar directamente
        const _player = new window.YT.Player(newTrack.id, {
          height: "0",
          width: "0",
          videoId: newTrack.videoId,
          playerVars: { 
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1
          },
          events: {
            onReady: (event: { target: YTPlayer }) => {
              setFloatingAudios((prev) =>
                prev.map((aud) =>
                  aud.id === newTrack.id
                    ? {
                        ...aud,
                        player: event.target,
                        duration: event.target.getDuration(),
                      }
                    : aud
                )
              );
            },
            onStateChange: (event: { data: number }) => {
              if (event.data === window.YT.PlayerState.ENDED) {
                setFloatingAudios((prev) =>
                  prev.map((aud) =>
                    aud.id === newTrack.id ? { ...aud, isPlaying: false } : aud
                  )
                );
              }
            }
          },
        });
      }
    }, 500);
  }, [floatingAudios]);

  const handleDragStart = (e: React.MouseEvent, id: string) => {
    const target = e.currentTarget as HTMLElement;
    const offsetX = e.clientX - target.getBoundingClientRect().left;
    const offsetY = e.clientY - target.getBoundingClientRect().top;

    const handleMouseMove = (e: MouseEvent) => {
      setFloatingAudios((prev) =>
        prev.map((aud) =>
          aud.id === id ? { ...aud, x: e.clientX - offsetX, y: e.clientY - offsetY } : aud
        )
      );
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const togglePlay = (videoId: string) => {
    setFloatingAudios((prev) =>
      prev.map((aud) => {
        if (aud.id === videoId && aud.player) {
          try {
            const playerState = aud.player.getPlayerState();
            
            if (playerState === 1) {
              aud.player.pauseVideo();
              return { ...aud, isPlaying: false };
            } else {
              aud.player.playVideo();
              return { ...aud, isPlaying: true };
            }
          } catch (error) {
            console.error('Error al alternar reproducción:', error);
            return aud;
          }
        }
        return aud;
      })
    );
  };

  const handleProgressChange = (videoId: string, value: number) => {
    setFloatingAudios((prev) =>
      prev.map((aud) => {
        if (aud.id === videoId && aud.player) {
          try {
            const seekTime = (value / 100) * aud.duration;
            
            if (typeof aud.player.seekTo === 'function') {
              aud.player.seekTo(seekTime, true);
            }
            
            return { ...aud, progress: value };
          } catch (error) {
            console.error('Error cambiando progreso:', error);
            return aud;
          }
        }
        return aud;
      })
    );
  };

  const handleVolumeChange = (videoId: string, value: number) => {
    setFloatingAudios((prev) =>
      prev.map((aud) => {
        if (aud.id === videoId && aud.player) {
          try {
            if (typeof aud.player.setVolume === 'function') {
              aud.player.setVolume(value);
            }
            
            return { ...aud, volume: value };
          } catch (error) {
            console.error('Error cambiando volumen:', error);
            return aud;
          }
        }
        return aud;
      })
    );
  };

  const addToPlaylist = (track: AudioTrack) => {
    setPlaylist(prevPlaylist => {
      const exists = prevPlaylist.some(t => t.id === track.id);
      if (exists) return prevPlaylist;
      return [...prevPlaylist, track];
    });
  };

  const removeFromPlaylist = (trackId: string) => {
    setPlaylist(prevPlaylist => 
      prevPlaylist.filter(track => track.id !== trackId)
    );
  };

  const playFromPlaylist = (track: AudioTrack) => {
    const audioSearchResult: SearchResult = {
      id: { videoId: track.videoId },
      snippet: {
        title: track.title,
        thumbnails: { default: { url: track.thumbnail } }
      }
    };
    playSelectedAudio(audioSearchResult);
  };

  return (
    <div className="app-container">
      <h1 className="page-title"> BangTube</h1>
      
      <div className="search-container">
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <input
            type="text"
            placeholder="Buscar canción..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="search-input"
            onKeyPress={(e) => e.key === 'Enter' && searchVideo()}
          />
          <button 
            onClick={searchVideo} 
            disabled={isLoading}
            className="search-button"
            style={{ width: '100%' }}
          >
            {isLoading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {results.length > 0 && (
          <div className="result-container">
            <h3 className="section-title">Resultados</h3>
            <div className="scrollable-content">
              {results.map((item) => (
                <div key={item.id.videoId} className="result-item">
                  <div 
                    className="result-content"
                    onClick={() => playSelectedAudio(item)} 
                  >
                    <Image 
                      src={item.snippet.thumbnails.default.url} 
                      alt={item.snippet.title} 
                      width={56}
                      height={56}
                      className="track-thumbnail"
                    />
                    <p className="track-title">{item.snippet.title}</p>
                  </div>
                  <button 
                    onClick={() => addToPlaylist({
                      id: item.id.videoId,
                      videoId: item.id.videoId,
                      title: item.snippet.title,
                      thumbnail: item.snippet.thumbnails.default.url
                    })}
                    className="add-to-playlist-button"
                  >
                    + Playlist
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="two-column-layout">
          {/* Playlist (Izquierda) */}
          <div className="sidebar">
            <h3 className="section-title">Mi Playlist</h3>
            <div className="scrollable-content">
              {playlist.length === 0 ? (
                <p className="empty-message">No hay canciones en tu playlist</p>
              ) : (
                playlist.map((track) => (
                  <div key={track.id} className="track-item">
                    <Image 
                      src={track.thumbnail} 
                      alt={track.title} 
                      width={56}
                      height={56}
                      className="track-thumbnail"
                    />
                    <p className="track-title">{track.title}</p>
                    <div>
                      <button 
                        onClick={() => playFromPlaylist(track)}
                        className="action-button play-button"
                      >
                        ▶
                      </button>
                      <button 
                        onClick={() => removeFromPlaylist(track.id)}
                        className="action-button remove-button"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Historial (Derecha) */}
          <div className="sidebar">
            <h3 className="section-title">Historial</h3>
            <div className="scrollable-content">
              {history.length === 0 ? (
                <p className="empty-message">No hay historial de reproducción</p>
              ) : (
                history.map((track) => (
                  <div key={track.id} className="track-item">
                    <Image 
                      src={track.thumbnail} 
                      alt={track.title} 
                      width={56}
                      height={56}
                      className="track-thumbnail"
                    />
                    <p className="track-title">{track.title}</p>
                    <button 
                      onClick={() => playFromPlaylist(track)}
                      className="action-button play-button"
                    >
                      ▶
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reproductores flotantes */}
      {floatingAudios.map((audio) => (
        <div
          key={audio.id}
          onMouseDown={(e) => handleDragStart(e, audio.id)}
          className="floating-player"
          style={{ left: audio.x, top: audio.y }}
        >
          <div id={audio.id} style={{ display: "none" }}></div>
          <div className="player-header">
            <p className="player-title">{audio.title}</p>
            <button 
              onClick={() => setFloatingAudios(floatingAudios.filter((v) => v.id !== audio.id))}
              className="close-button"
            >
              ✕
            </button>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            value={audio.progress}
            onChange={(e) => handleProgressChange(audio.id, Number(e.target.value))}
            className="progress-bar"
          />

          <div className="player-controls">
            <button 
              onClick={() => togglePlay(audio.id)}
              className="play-pause-button"
            >
              {audio.isPlaying ? '❚❚' : '▶'}
            </button>
            
            <div className="volume-control">
              <span className="volume-label">Vol</span>
              <input
                type="range"
                min="0"
                max="100"
                value={audio.volume}
                onChange={(e) => handleVolumeChange(audio.id, Number(e.target.value))}
                className="volume-slider"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}