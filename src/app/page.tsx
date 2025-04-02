'use client';

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

declare global {
  interface Window {
    YT: {
      Player: new (elementId: string, options: YTPlayerOptions) => YTPlayer;
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
  isPlaylistMode?: boolean; 
  playlistIndex?: number;   
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

interface YTPlayerOptions {
  height: string | number;
  width: string | number;
  videoId: string;
  playerVars?: {
    autoplay?: number;
    controls?: number;
    disablekb?: number;
    fs?: number;
    iv_load_policy?: number;
    modestbranding?: number;
    [key: string]: unknown;
  };
  events?: {
    onReady?: (event: { target: YTPlayer }) => void;
    onStateChange?: (event: { data: number }) => void;
    [key: string]: unknown;
  };
}

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
  const [playlistActive, setPlaylistActive] = useState(false);  // Nuevo: controla si la playlist está activa
  const [currentPlaylistIndex, setCurrentPlaylistIndex] = useState(-1);  // Nuevo: índice actual en la playlist

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

  useEffect(() => {
    const checkPlaylistProgression = () => {
      if (!playlistActive || currentPlaylistIndex < 0 || playlist.length === 0) return;

      const currentPlaylistAudio = floatingAudios.find(
        audio => audio.isPlaylistMode && audio.playlistIndex === currentPlaylistIndex
      );

      if (!currentPlaylistAudio || 
          (currentPlaylistAudio.player && 
           currentPlaylistAudio.player.getPlayerState() === window.YT?.PlayerState?.ENDED)) {
        
        const nextIndex = currentPlaylistIndex + 1;
        
        if (nextIndex < playlist.length) {
          playFromPlaylistWithIndex(playlist[nextIndex], nextIndex);
        } else {

          setPlaylistActive(false);
          setCurrentPlaylistIndex(-1);
        }
      }
    };

    const playlistInterval = setInterval(checkPlaylistProgression, 1000);
    return () => clearInterval(playlistInterval);
  }, [playlistActive, currentPlaylistIndex, playlist, floatingAudios]);

  const searchVideo = async () => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setError('La búsqueda debe tener al menos 2 caracteres');
      return;
    }
  
    setIsLoading(true);
    setError(null);
    
    const apiUrl = `/api/youtube?q=${encodeURIComponent(trimmedQuery)}`;
    console.log("Llamando a API:", apiUrl);
  
    try {
      const response = await fetch(apiUrl);
      console.log("Estado de respuesta:", response.status);
      
      const responseData = await response.json();
      console.log("Datos de respuesta:", responseData);
      
      if (!response.ok) {
        setError(responseData.error || 'Error en la búsqueda de videos');
        setResults([]);
        return;
      }
      
      if (responseData.items && responseData.items.length > 0) {
        console.log("Resultados encontrados:", responseData.items.length);
        setResults(responseData.items);
      } else {
        setResults([]);
        setError('No se encontraron resultados. Verifica tu búsqueda.');
      }
    } catch (error) {
      console.error('Error de búsqueda:', error);
      setError('No se pudo realizar la búsqueda. Revisa la consola para más detalles.');
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const playSelectedAudio = useCallback((audio: SearchResult, playlistMode = false, index = -1) => {
    if (!playlistMode || index === 0) {
      floatingAudios.forEach(existingAudio => {
        if (existingAudio.player && typeof existingAudio.player.pauseVideo === 'function') {
          existingAudio.player.pauseVideo();
        }
      });
    }

    if (playlistMode && index === 0) {
      setFloatingAudios(prev => prev.filter(audio => !audio.isPlaylistMode));
    }

    if (floatingAudios.length >= 5 && !playlistMode) {
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

    const existingAudioIndex = floatingAudios.findIndex(a => a.id === newTrack.id);
    
    if (existingAudioIndex >= 0 && playlistMode) {
      setFloatingAudios(prev => 
        prev.map((aud, idx) => {
          if (idx === existingAudioIndex) {
            if (aud.player) {
              aud.player.playVideo();
            }
            return {
              ...aud,
              isPlaying: true,
              isPlaylistMode: playlistMode,
              playlistIndex: index
            };
          }
          return aud;
        })
      );
      return;
    }

  
    const posX = playlistMode ? window.innerWidth / 2 - 150 : 100 + floatingAudios.length * 20;
    const posY = playlistMode ? window.innerHeight / 2 - 80 : 100 + floatingAudios.length * 20;

    const newAudio: FloatingAudio = {
      ...newTrack,
      x: posX,
      y: posY,
      player: null,
      progress: 0,
      duration: 1,
      volume: 100,
      isPlaying: false,
      isPlaylistMode: playlistMode,
      playlistIndex: index
    };

    setFloatingAudios((prev) => 
      prev.filter(aud => !playlistMode || aud.id !== newTrack.id).concat(newAudio)
    );

    setTimeout(() => {
      if (typeof window !== 'undefined' && window.YT) {
        const newPlayer = new window.YT.Player(newTrack.id, {
          height: "0",
          width: "0",
          videoId: newTrack.videoId,
          playerVars: { 
            autoplay: playlistMode ? 1 : 0,
            controls: 0, 
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1
          },
          events: {
            onReady: (event: { target: YTPlayer }) => {
              setFloatingAudios((prev) =>
                prev.map((aud) => {
                  if (aud.id === newTrack.id) {
                    // Si es modo playlist, comenzar a reproducir automáticamente
                    if (playlistMode) {
                      event.target.playVideo();
                    }
                    return {
                      ...aud,
                      player: event.target,
                      duration: event.target.getDuration(),
                      isPlaying: playlistMode
                    };
                  }
                  return aud;
                })
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
        
        console.log("Player created:", newPlayer ? "success" : "failed");
      }
    }, 500);
  }, [floatingAudios]);

  const startPlaylistPlayback = () => {
    if (playlist.length === 0) {
      setError('No hay canciones en la playlist');
      return;
    }

    setPlaylistActive(true);
    setCurrentPlaylistIndex(0);
    
    const firstTrack = playlist[0];
    const audioSearchResult: SearchResult = {
      id: { videoId: firstTrack.videoId },
      snippet: {
        title: firstTrack.title,
        thumbnails: { default: { url: firstTrack.thumbnail } }
      }
    };
    
    playSelectedAudio(audioSearchResult, true, 0);
  };

  const playFromPlaylistWithIndex = (track: AudioTrack, index: number) => {
    setCurrentPlaylistIndex(index);
    
    const audioSearchResult: SearchResult = {
      id: { videoId: track.videoId },
      snippet: {
        title: track.title,
        thumbnails: { default: { url: track.thumbnail } }
      }
    };
    
    playSelectedAudio(audioSearchResult, true, index);
  };

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
          } catch (error: unknown) {
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
          } catch (error: unknown) {
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
          } catch (error: unknown) {
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

  const stopPlaylist = () => {
    setPlaylistActive(false);
    setCurrentPlaylistIndex(-1);
    
    setFloatingAudios(prev => 
      prev.map(audio => {
        if (audio.isPlaylistMode && audio.player) {
          audio.player.pauseVideo();
          return { ...audio, isPlaying: false };
        }
        return audio;
      })
    );
  };

  return (
    <div className="app-container">
      <header className="header-container">
        <h1 className="page-title" 
            onClick={() => alert('¡Bienvenido a BangTube! Efectivamente no la pense bien al poner el nombre')}>
          BangTube
        </h1>
      </header>
      
      <main className="search-container">
        <div className="search-wrapper">
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
          >
            {isLoading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
  
        {error && <div className="error-message">{error}</div>}
  
        {results.length > 0 && (
          <section className="results-section">
            <h3 className="section-title">Resultados</h3>
            <div className="scrollable-results">
              {results.map((item) => (
                <div key={item.id.videoId} className="result-item">
                  <div 
                    className="result-content"
                    onClick={() => playSelectedAudio(item)} 
                  >
                    <Image 
                      src={item.snippet.thumbnails.default.url} 
                      alt={item.snippet.title} 
                      width={120}
                      height={90}
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
          </section>
        )}
  
        <div className="two-column-layout">
          <section className="sidebar playlist-sidebar">
            <div className="playlist-header">
              <h3 className="section-title">Mi Playlist</h3>
              {playlist.length > 0 && (
                <button 
                  onClick={playlistActive ? stopPlaylist : startPlaylistPlayback}
                  className={`playlist-control-button ${playlistActive ? 'stop-button' : 'play-button'}`}
                >
                  {playlistActive ? '■ Detener' : '▶ Reproducir todo'}
                </button>
              )}
            </div>
            
            {playlistActive && (
              <div className="playlist-status">
                Reproduciendo playlist: canción {currentPlaylistIndex + 1} de {playlist.length}
              </div>
            )}
            
            <div className="scrollable-content">
              {playlist.length === 0 ? (
                <p className="empty-message">No hay canciones en tu playlist</p>
              ) : (
                playlist.map((track, index) => (
                  <div 
                    key={track.id} 
                    className={`track-item ${playlistActive && index === currentPlaylistIndex ? 'now-playing' : ''}`}
                  >
                    <Image 
                      src={track.thumbnail} 
                      alt={track.title} 
                      width={120}
                      height={90}
                      className="track-thumbnail"
                    />
                    <p className="track-title">{track.title}</p>
                    <div className="track-controls">
                      <button 
                        onClick={() => playFromPlaylist(track)}
                        className="action-button play-button"
                        aria-label="Reproducir"
                      >
                        ▶
                      </button>
                      <button 
                        onClick={() => removeFromPlaylist(track.id)}
                        className="action-button remove-button"
                        aria-label="Eliminar"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
  
          <section className="sidebar history-sidebar">
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
                      width={120}
                      height={90}
                      className="track-thumbnail"
                    />
                    <p className="track-title">{track.title}</p>
                    <button 
                      onClick={() => playFromPlaylist(track)}
                      className="action-button play-button"
                      aria-label="Reproducir"
                    >
                      ▶
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>
  
      {floatingAudios.map((audio) => (
        <div
          key={audio.id}
          onMouseDown={(e) => handleDragStart(e, audio.id)}
          className={`floating-player ${audio.isPlaylistMode ? 'playlist-mode' : ''} ${audio.isPlaylistMode && audio.playlistIndex === currentPlaylistIndex ? 'current-playlist-track' : ''}`}
          style={{ left: audio.x, top: audio.y }}
        >
          <div id={audio.id} style={{ display: "none" }}></div>
          <div className="player-header">
            <p className="player-title">
              {audio.isPlaylistMode && `[${audio.playlistIndex! + 1}/${playlist.length}] `}
              {audio.title}
            </p>
            <button 
              onClick={() => {
                if (audio.isPlaylistMode && playlistActive) {
                  const nextIndex = audio.playlistIndex! + 1;
                  if (nextIndex < playlist.length) {
                    playFromPlaylistWithIndex(playlist[nextIndex], nextIndex);
                  } else {
                    stopPlaylist();
                  }
                }
                setFloatingAudios(floatingAudios.filter((v) => v.id !== audio.id));
              }}
              className="close-button"
              aria-label="Cerrar"
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
            aria-label="Progreso de reproducción"
          />
  
          <div className="player-controls">
            <button 
              onClick={() => togglePlay(audio.id)}
              className="play-pause-button"
              aria-label={audio.isPlaying ? 'Pausar' : 'Reproducir'}
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
                aria-label="Control de volumen"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}