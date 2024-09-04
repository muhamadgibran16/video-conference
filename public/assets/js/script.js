var AppProcess = (function () {
  // Declare variables used in the module
  var peers_connection_ids = [];
  var peers_connection = {};
  var remote_vid_stream = {};
  var remote_aud_stream = {};
  var local_div;
  var serverProcess;
  var audio;
  var isAudioMute = true;
  var rtp_aud_senders = {};
  var rtp_vid_senders = {};
  var video_states = {
    None: 0,
    Camera: 1,
    ScreenShare: 2,
  };
  var video_st = video_states.None;
  var videoCamTrack;

  // Initialize the module
  async function _init(SDP_function, my_connid) {
    serverProcess = SDP_function;
    my_connection_id = my_connid;
    eventProcess(); // Initialize event processing
    local_div = document.getElementById('localVideoPlayer');
  }

  // Event handling
  function eventProcess() {
    $('#micMuteUnmute').on('click', async function () {
      // Control mute/unmute audio
      if (!audio) {
        await loadAudio();
      }
      if (!audio) {
        alert('Audio permission has not been granted');
        return;
      }
      if (isAudioMute) {
        audio.enabled = true;
        $(this).html("<i class='bi bi-mic-fill'></i>");
        updateMediaSenders(audio, rtp_aud_senders);
      } else {
        audio.enabled = false;
        $(this).html("<i class='bi bi-mic-mute-fill'></i>");
        removeMediaSenders(rtp_aud_senders);
      }
      isAudioMute = !isAudioMute;
    });

    $('#videoCamOnOff').on('click', async function () {
      // Control camera (enable/disable)
      if (video_st === video_states.Camera) {
        await videoProcess(video_states.None);
      } else {
        await videoProcess(video_states.Camera);
      }
    });

    $('#ScreenShareOnOff').on('click', async function () {
      // Control screenshare (enable/disable)
      if (video_st === video_states.ScreenShare) {
        await videoProcess(video_states.None);
      } else {
        await videoProcess(video_states.ScreenShare);
      }
    });
  }

  // Load audio stream
  async function loadAudio() {
    try {
      var astream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      audio = astream.getAudioTracks()[0];
      audio.enabled = false;
      console.log('audio => ', audio);
    } catch (error) {
      console.log(error);
    }
  }

  // Check peer connection status
  function connection_status(connection) {
    return connection && ['new', 'connecting', 'connected'].includes(connection.connectionState);
  }

  // Update media senders to peers
  async function updateMediaSenders(track, rtp_senders) {
    for (var con_id in peers_connection_ids) {
      if (connection_status(peers_connection[con_id])) {
        if (rtp_senders[con_id] && rtp_senders[con_id].track) {
          rtp_senders[con_id].replaceTrack(track);
        } else {
          rtp_senders[con_id] = peers_connection[con_id].addTrack(track);
        }
      }
    }
  }

  // Konfigurasi ICE (Interactive Connectivity Establishment)
  var iceConfiguration = {
    iceServers: [{
        urls: 'stun:stun.l.google.com:19032',
      },
      {
        urls: 'stun:stun1.l.google.com:19032',
      },
    ]
  };


  // Mengatur koneksi peer
  async function setConnection(connid) {
    var connection = new RTCPeerConnection(iceConfiguration);
    connection.onnegotiationneeded = async function (event) {
      await setOffer(connid);
    };
    connection.onicecandidate = function (event) {
      if (event.candidate) {
        serverProcess(JSON.stringify({
          icecandidate: event.candidate
        }), connid);
      }
    };
    connection.ontrack = function (event) {
      if (!remote_vid_stream[connid]) {
        remote_vid_stream[connid] = new MediaStream();
      }
      if (!remote_aud_stream[connid]) {
        remote_aud_stream[connid] = new MediaStream();
      }
      if (event.track.kind == 'video') {
        remote_vid_stream[connid].getVideoTracks().forEach((t) => remote_vid_stream[connid].removeTrack(t));
        remote_vid_stream[connid].addTrack(event.track);
        var remoteVideoPlayer = document.getElementById('v_' + connid);
        remoteVideoPlayer.srcObject = null;
        remoteVideoPlayer.srcObject = remote_vid_stream[connid];
        remoteVideoPlayer.load();
      } else if (event.track.kind == 'audio') {
        remote_aud_stream[connid].getVideoTracks().forEach((t) => remote_aud_stream[connid].removeTrack(t));
        remote_aud_stream[connid].addTrack(event.track);
        var remoteAudioPlayer = document.getElementById('a_' + connid);
        remoteAudioPlayer.srcObject = null;
        remoteAudioPlayer.srcObject = remote_aud_stream[connid];
        remoteAudioPlayer.load();
      }
    };
    peers_connection_ids[connid] = connid;
    peers_connection[connid] = connection;

    if (video_st == video_states.Camera || video_st == video_states.ScreenShare) {
      if (videoCamTrack) {
        updateMediaSenders(videoCamTrack, rtp_vid_senders);
      }
    }

    return connection;
  }

  // Mengatur tawaran (offer)
  async function setOffer(connid) {
    var connection = peers_connection[connid];
    var offer = await connection.createOffer();

    await connection.setLocalDescription(offer);
    serverProcess(JSON.stringify({
      offer: connection.localDescription, // mengirim tawaran ke server
    }), connid);
  }

  // Remove media senders from peers
  function removeMediaSenders(rtp_senders) {
    for (var con_id in peers_connection_ids) {
      if (rtp_senders[con_id] && connection_status(peers_connection[con_id])) {
        peers_connection[con_id].removeTrack(rtp_senders[con_id]);
        rtp_senders[con_id] = null;
      }
    }
  }

  // Remove video stream and video senders
  function removeVideoStream(rtp_vid_senders) {
    if (videoCamTrack) {
      videoCamTrack.stop();
      videoCamTrack = null;
      local_div.srcObject = null;
      removeMediaSenders(rtp_vid_senders);
    }
  }

  // Menutup koneksi peer
  async function closeConnection(connid) {
    peers_connection_ids[connid] = null;
    if (peers_connection[connid]) {
      peers_connection[connid].close();
      peers_connection[connid] = null;
    }
    if (remote_aud_stream[connid]) {
      remote_aud_stream[connid].getTracks().forEach((t) => {
        if (t.stop) t.stop();
      });
      remote_aud_stream[connid] = null;
    }
    if (remote_vid_stream[connid]) {
      remote_vid_stream[connid].getTracks().forEach((t) => {
        if (t.stop) t.stop();
      });
      remote_vid_stream[connid] = null;
    }

    // Hapus elemen video/audio terkait dari DOM
    var remoteVideoPlayer = document.getElementById('v_' + connid);
    if (remoteVideoPlayer) {
      remoteVideoPlayer.srcObject = null;
      remoteVideoPlayer.remove();
    }

    var remoteAudioPlayer = document.getElementById('a_' + connid);
    if (remoteAudioPlayer) {
      remoteAudioPlayer.srcObject = null;
      remoteAudioPlayer.remove();
    }
  }


  // Pemrosesan pesan SDP (Session Description Protocol)
  async function SDPProcess(message, from_connid) {
    message = JSON.parse(message);
    if (message.answer) {
      await peers_connection[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.answer)
      );
    } else if (message.offer) {
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid);
      }
      await peers_connection[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.offer)
      );
      var answer = await peers_connection[from_connid].createAnswer();
      await peers_connection[from_connid].setLocalDescription(answer);
      serverProcess(
        JSON.stringify({
          answer: answer,
        }),
        from_connid
      );
    } else if (message.icecandidate) {
      if (!peers_connection[from_connid]) {
        await setConnection(from_connid);
      }
      try {
        await peers_connection[from_connid].addIceCandidate(message.icecandidate);
      } catch (error) {
        console.log(error);
      }
    }
  }

  // Set video status (camera or screenshare)
  async function videoProcess(newVideoState) {
    if (newVideoState === video_states.None) {
      $('#videoCamOnOff').html("<i class='bi bi-camera-video-off-fill'></i>");
      $('#ScreenShareOnOff').html("<i class='bi bi-arrow-up-right-square-fill'></i><div>Present Now</div>");
      video_st = newVideoState;
      removeVideoStream(rtp_vid_senders);
      return;
    }
    if (newVideoState === video_states.Camera) {
      $('#videoCamOnOff').html("<i class='bi bi-camera-video-fill'></i>");
    }
    if (newVideoState === video_states.ScreenShare) {
      $('#ScreenShareOnOff').html("<i class='bi bi-stop-fill'></i><div>Stop Presenting</div>");
    }
    try {
      removeVideoStream(rtp_vid_senders);
      var vstream;
      if (newVideoState === video_states.Camera) {
        vstream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      } else if (newVideoState === video_states.ScreenShare) {
        vstream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
      }
      local_div.srcObject = vstream;
      videoCamTrack = vstream.getVideoTracks()[0];
      videoCamTrack.enabled = true;
      updateMediaSenders(videoCamTrack, rtp_vid_senders);
      video_st = newVideoState;
    } catch (error) {
      console.log(error);
    }
  }

  return {

    init: async function (SDP_function, my_connid) {
      await _init(SDP_function, my_connid);
    },
    setNewConnection: async function (connid) {
      await setConnection(connid)
    },
    closeConnectionCall: async function (connid) {
      await closeConnection(connid);
    },
    processClientFunc: async function (data, from_connid) {
      await SDPProcess(data, from_connid);
    },
    // startRecordingAudio: async function (connid) {
    //   await startRecording(connid);
    // },
    // stopRecordingAudio: async function (connid) {
    //   stopRecording(connid);
    // },
  };
})();


var MyApp = (function () {
  var socket = null; // Variabel untuk objek koneksi socket
  var user_id = ''; // ID pengguna
  var meeting_id = ''; // ID pertemuan

  function init(uid, mid) {
    user_id = uid;
    meeting_id = mid;
    // Menampilkan elemen pertemuan pada antarmuka pengguna
    $('#meetingContainer').show();
    $('#me h2').text(user_id + '(Me)');
    document.title = user_id;
    event_process_for_signaling_server();
    eventHandeling();
  }

  function event_process_for_signaling_server() {
    socket = io.connect(); // Menghubungkan socket ke server

    var SDP_function = function (data, to_connid) {
      // Mengirim pesan SDP (Session Description Protocol) ke server
      socket.emit('SDPProcess', {
        message: data,
        to_connid: to_connid,
      })
    }
    socket.on('connect', () => {
      // Menyambungkan socket ke server dan menginisialisasi aplikasi
      if (socket.connected) {
        AppProcess.init(SDP_function, socket.id)
        if (user_id != '' && meeting_id != '') {
          socket.emit('userconnect', {
            displayName: user_id,
            meeting_id: meeting_id
          })
        }
      }
    })
    socket.on('inform_other_about_disconnected_user', function (data) {
      $('#' + data.connId).remove();
      $('.participant-count').text(data.uNumber);
      $('#participant_' + data.connId + '').remove();
      AppProcess.closeConnectionCall(data.connId);
    })
    socket.on('inform_others_about_me', function (data) {
      addUser(data.other_user_id, data.connId, data.userNumber);
      AppProcess.setNewConnection(data.connId);
    });

    socket.on('showFileMesssage', function (data) {
      var time = new Date()
      var lTime = time.toLocalString('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      })
      var attachFileAreaForOther = document.querySelector('.show-attach-file')
      attachFileAreaForOther.innerHTML += '<div class="left-align" style="display: flex; align-items: center;"><img src="public/assets/img/pngwing.com (12).png" style="height: 40px; width: 40px;" class="caller-image circle"/><div style="font-weight: 600; margin: 0 5px;">' + data.username + '</div>:<div><a style="color: #007bff;" href="' + data.filePath + '" download>' + data.fileName + '</a></div></div><br>'
    })

    socket.on('inform_me_about_other_user', function (other_users) {
      var userNumber = other_users.length;
      var userNumb = userNumber + 1;
      if (other_users) {
        for (var i = 0; i < other_users.length; i++) {
          // Periksa apakah pengguna sudah ada di layar
          var existingUser = document.getElementById(other_users[i].connectionId);
          if (!existingUser) {
            addUser(other_users[i].user_id, other_users[i].connectionId, userNumb);
            AppProcess.setNewConnection(other_users[i].connectionId);
          }
        }
      }
    })

    socket.on('SDPProcess', async function (data) {
      await AppProcess.processClientFunc(data.message, data.from_connid)
    })
    socket.on('showChatMessage', function (data) {
      var time = new Date();
      var lTime = time.toLocaleString('en-US', {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      })
      var div = $('<div>').html('<span class="fw-bold me-3" style="color: #000;">' + data.from + '</span>' + lTime + '<br>' + data.message)
      $('#messages').append(div)
    })
  }

  function eventHandeling() {
    // Menangani event klik tombol kirim pesan
    $('#btnsend').on('click', function () {
      var msgData = $('#msgbox').val()
      socket.emit('sendMessage', msgData);
      var time = new Date();
      var lTime = time.toLocaleString('en-US', {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      })
      var div = $('<div>').html('<span class="fw-bold me-3" style="color: #000;">' + user_id + '</span>' + lTime + '<br>' + msgData)
      $('#messages').append(div)
      $('#msgbox').val('');
    })
    var url = window.location.href;
    $('.meeting_url').text(url)

    $('#divUsers').on('dblclick', 'video', function () {
      this.requestFullScreen();
    })

  }
  // menambahkan pengguna ke daftar peserta pertemuan
  function addUser(other_user_id, connId, userNum) {
    var newDivId = $('#otherTemplate').clone();
    newDivId = newDivId.attr('id', connId).addClass('other')
    newDivId.find('h2').text(other_user_id)
    newDivId.find('video').attr('id', 'v_' + connId)
    newDivId.find('audio').attr('id', 'a_' + connId)
    newDivId.show()

    $('#divUsers').append(newDivId)
    $('.in-call-wrap-up').append('<div class="in-call-wrap d-flex justify-content-between align-items-center mb-3" id="participant_' + connId + '"> <div class="participant-img-name-wrap display-center cursor-pointer"> <div class="participant-img"> <img src="public/assets/img/pngwing.com (12).png" class="border border-secondary" alt="" style="width: 40px; height: 40px; border-radius: 50%;"> </div> <div class="participant-img ms-2">' + other_user_id + '</div> </div> <div class="participant-action-wrap display-center"> <div class="participant-action-wrap-pin display-center me-2 cursor-pointer"> <i class="bi bi-pin"></i> </div> <div class="participant-action-wrap-dot display-center me-2 cursor-pointer"> <i class="bi bi-three-dots-vertical"></i> </div> </div> </div>')

    $(".participant-count").text(userNum)
  }
  // Menggantikan elemen dengan ID tertentu dengan elemen baru yang sesuai dengan pengguna yang bergabung
  $(document).on('click', '.people-heading', function () {
    $('.in-call-wrap-up').show(300)
    $('.chat-show-wrap').hide(300)
    $(this).addClass('active')
    $('.chat-heading').removeClass('active')
  })
  $(document).on('click', '.chat-heading', function () {
    $('.in-call-wrap-up').hide(300)
    $('.chat-show-wrap').show(300)
    $(this).addClass('active')
    $('.people-heading').removeClass('active')
  })
  $(document).on('click', '.meeting-heading-cross', function () {
    $('.g-right-details-wrap').hide(300)
  })
  $(document).on('click', '.top-left-participant-wrap', function () {
    $('.people-heading').addClass('active')
    $('.chat-heading').removeClass('active')
    $('.g-right-details-wrap').show(300)
    $('.in-call-wrap-up').show(300)
    $('.chat-show-wrap').hide(300)
  })
  $(document).on('click', '.top-left-chat-wrap', function () {
    $('.people-heading').removeClass('active')
    $('.chat-heading').addClass('active')
    $('.g-right-details-wrap').show(300)
    $('.in-call-wrap-up').hide(300)
    $('.chat-show-wrap').show(300)
  })
  $(document).on('click', '.end-call-wrap', function () {
    $('.top-box-show').css({
      "display": "block",
    }).html(' <div class="top-box align-vertical-middle profile-dialog-show text-center mt-3"> <h1 class="mt-2">Leave Meeting</h1> <div class="call-leave-cancel-action d-flex justify-content-center align-items-center w-100"> <a href="/action.html"><button class="call-leave-action btn btn-danger me-5">Leave</button></a> <button class="call-cancel-action btn btn-secondary">Cancel</button> </div> </div>')
  })
  $(document).on('click', '.end-call-wrap', function () {
    $('.top-box-show').css({
      "display": "block",
    }).html(' <div class="top-box align-vertical-middle profile-dialog-show text-center mt-3"> <h1 class="mt-2">Leave Meeting</h1> <div class="call-leave-cancel-action d-flex justify-content-center align-items-center w-100"> <a href="/action.html"><button class="call-leave-action btn btn-danger me-5">Leave</button></a> <button class="call-cancel-action btn btn-secondary">Cancel</button> </div> </div>')
  })
  $(document).mouseup(function (e) {
    var container = new Array()
    container.push($('.top-box-show'));
    $.each(container, function (key, value) {
      if (!$(value).is(e.target) && $(value).has(e.target).length == 0) {
        $(value).empty();
      }
    });
  })
  $(document).mouseup(function (e) {
    var container = new Array()
    container.push($('.g-details'));
    container.push($('.g-right-details-wrap'));
    $.each(container, function (key, value) {
      if (!$(value).is(e.target) && $(value).has(e.target).length == 0) {
        $(value).hide(300);
      }
    });
  })
  $(document).on('click', '.call-cancel-action', function () {
    $('.top-box-show').html('');
  })

  $(document).on('click', '.copy_info', function () {
    var $temp = $('<input>')
    $('body').append($temp)
    $temp.val($('.meeting_url').text()).select()
    document.execCommand('copy')
    $temp.remove()
    $('.link-conf').show()
    setTimeout(function () {
      $('.link-conf').hide()
    }, 3000)
  })
  $(document).on('click', '.meeting-details-button', function () {
    $('.g-details').slideToggle(300)
  })
  $(document).on('click', '.g-details-heading-attachment', function () {
    $('.g-details-heading-show').hide()
    $('.g-details-heading-show-attachment').show()
    $(this).addClass('active')
    $('.g-details-heading-detail').removeClass('active')
  })
  $(document).on('click', '.g-details-heading-detail', function () {
    $('.g-details-heading-show').show()
    $('.g-details-heading-show-attachment').hide()
    $(this).addClass('active')
    $('.g-details-heading-attachment').removeClass('active')
  })
  var base_url = window.location.origin
  $(document).on('change', '.custom-file-input', function () {
    var filename = $(this).val().split('\\').pop()
    $(this).siblings('.custom-file-label').addClass('selected').html(filename)
  })
  $(document).on('click', '.share-attach', function (e) {
    e.preventDefault()
    var att_img = $('#customFile').prop('files')[0]
    var formData = new FormData()
    formData.append('zipfile', att_img)
    formData.append('meeting_id', meeting_id)
    formData.append('username', user_id)
    console.log(formData);
    $.ajax({
      url: base_url + '/attachimg',
      type: 'POST',
      data: formData,
      contentType: false,
      processData: false,
      success: function (response) {
        console.log(response);
      },
      error: function () {
        console.log('error');
      }
    })

    var attachFileArea = documet.querySelector('.show-attach-file')
    var attachFileName = $('#customFile').val().split('\\').pop()
    var attachFilePath = 'public/attachment/' + meeting_id + '/' + attachFileName
    attachFileArea.innerHTML += '<div class="left-align" style="display: flex; align-items: center;"><img src="public/assets/img/pngwing.com (12).png" style="height: 40px; width: 40px;" class="caller-image circle"/><div style="font-weight: 600; margin: 0 5px;">' + user_id + '</div>:<div><a style="color: #007bff;" href="' + attachFilePath + '" download>' + attachFileName + '</a></div></div><br>'
    $('label.custom-file-label').text('')
    socket.emit('fileTransferToOther', {
      username: user_id,
      meetingid: meeting_id,
      filePath: attachFilePath,
      fileName: attachFileName,
    })
  })

  $(document).on('click', '.option-icon', function () {
    $('.recording-show').toggle(300)
  })

  $(document).on('click', '.start-record', function () {
    $(this).removeClass().addClass('stop-record btn-danger text-dark').text('Stop Recording')
    startRecording()
  })
  $(document).on('click', '.stop-record', function () {
    $(this).removeClass().addClass('start-record btn-dark text-danger').text('Start Recording')
    stopRecording()
  })

  var audioRecorder;
  var videoRecorder;
  var audioChunks = [];
  var videoChunks = [];

  async function captureScreen(mediaConstraints = {
    video: true
  }) {
    const screenStream = await navigator.mediaDevices.getDisplayMedia(mediaConstraints)
    return screenStream;
  }
  async function captureAudio(mediaConstraints = {
    video: false,
    audio: true
  }) {
    const audioStream = await navigator.mediaDevices.getUserMedia(mediaConstraints)
    return audioStream;
  }
  async function startRecording() {
    const screenStream = await captureScreen()
    const audioStream = await captureAudio()

    audioRecorder = new MediaRecorder(audioStream)
    videoRecorder = new MediaRecorder(screenStream)

    audioRecorder.ondataavailable = function (e) {
      audioChunks.push(e.data)
    }

    videoRecorder.ondataavailable = function (e) {
      videoChunks.push(e.data)
    }

    audioRecorder.start()
    videoRecorder.start()
  }

  function stopRecording() {
    audioRecorder.stop()
    videoRecorder.stop()

    var clipName = prompt('Enter a name for your recording')

    const audioBlob = new Blob(audioChunks, {
      type: 'audio/wav'
    })
    const audioUrl = window.URL.createObjectURL(audioBlob)
    const audioA = document.createElement('a')
    audioA.style.display = 'none'
    audioA.href = audioUrl
    audioA.download = clipName + '_audio.wav'
    document.body.appendChild(audioA)
    audioA.click()
    setTimeout(() => {
      document.body.removeChild(audioA)
      window.URL.revokeObjectURL(audioUrl)
    }, 100)

    const videoBlob = new Blob(videoChunks, {
      type: 'video/webm'
    })
    const videoUrl = window.URL.createObjectURL(videoBlob)
    const videoA = document.createElement('a')
    videoA.style.display = 'none'
    videoA.href = videoUrl
    videoA.download = clipName + '_video.webm'
    document.body.appendChild(videoA)
    videoA.click()
    setTimeout(() => {
      document.body.removeChild(videoA)
      window.URL.revokeObjectURL(videoUrl)
    }, 100)

    audioChunks = []; // Reset audio chunks for the next recording
    videoChunks = []; // Reset video chunks for the next recording
  }



  return {
    _init: function (uid, mid) {
      init(uid, mid);
    }
  }
})();