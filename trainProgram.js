const trainData = require('./trainData');

const STATION_NUM = trainData.stations.length;
const TRAIN_NUM = trainData.trains.length;
const {LOADINGTIME, UNLOADINGTIME, stations} = trainData;
const RUNTIME_MAX = 600;
const POLL_INTERVAL = 1000;// in ms
const MQ = {messages: [], trackInUse: {}};
const DELAYMS = 200;
const trainStatus = {
  LOADING: 'LOADING',
  UNLOADING: 'UNLOADING',
  ONTRACK: 'ONTRACK',
  WAITING: 'WAITING'
};
const MTYPE = {
  REQ: 'requestTrack',
  GRA: 'grantTrack'
};


const calcDist = (begin, speed) => {
  const now = new Date();
  const intervalSec = (now - begin) / 1000;
  return (speed / 3600) * intervalSec * 1000;
};

const grantedForTrack = (mq, track) => {
  return Boolean(
    mq.messages.find(m => m.type === 'grantTrack' && m.track === track)
  );
};

const isGranted = (mq, train, track) => {
  return Boolean(
    mq.messages.find(m => m.type === 'grantTrack'
      && m.track === track && m.train === train)
  );
};

const controllerHandle = (mq) => {
  let req;
  for (let i = 0; i < STATION_NUM; i++) {
    if (!mq.trackInUse[i]) {
      req = mq.messages.find(m => m.type === MTYPE.REQ && m.track === i);
      if (req && !grantedForTrack(mq, i)) {
        const {train, track} = req;
        console.log(`Grant permission for train ${train} track ${track}`);
        mq.messages.push({type: 'grantTrack', track: track, train});
      }
    }
  }
};

const controllerProcess = () => {
  const startTime = new Date();
  const endTime = new Date(startTime);
  endTime.setSeconds(startTime.getSeconds() + RUNTIME_MAX);
  const interval = setInterval(() => {
    const now = new Date();
    if (now > endTime) {
      return clearInterval(interval);
    }
    controllerHandle(MQ);
  }, POLL_INTERVAL)
};

const trainProcess = (data, mq) => {
  const {speed, number, beginStation} = data;
  const startTime = new Date();
  const endTime = new Date(startTime);
  endTime.setSeconds(startTime.getSeconds() + RUNTIME_MAX);
  let curStation = beginStation;
  let status = trainStatus.LOADING;
  let startLoadTime = new Date();
  let endLoadTime = new Date(startLoadTime);
  endLoadTime.setSeconds(startLoadTime.getSeconds() + LOADINGTIME);
  let beginMoveTime, trackDist, beginUnloadTime, endUnloadTime, startWaitTime;
  const interval = setInterval(() => {
    const now = new Date();
    if (now > endTime) {
      return clearInterval(interval);
    }
    if (status === trainStatus.LOADING) {
      if (now < endLoadTime) {
        return console.log(`train ${number} loading at station ${curStation}`);
      }
      status = trainStatus.WAITING;
      startWaitTime = new Date();
      mq.messages.push({type: 'requestTrack', track: Number(curStation), train: Number(number)});
      console.log(mq.messages);
      return console.log(`train ${number} start waiting at station ${curStation}`);
    }
    if (status === trainStatus.WAITING) {
      if (isGranted(mq, number, Number(curStation))) {
        status = trainStatus.ONTRACK;
        mq.trackInUse[curStation] = true;
        setTimeout(() => {
          mq.messages = mq.messages.filter(m => !(m.type === 'grantTrack'
            && Number(m.track) === Number(curStation) && m.train === number));
          mq.messages = mq.messages.filter(m => !(m.type === 'requestTrack'
            && Number(m.track) === Number(curStation) && m.train === number));
        }, DELAYMS);
        beginMoveTime = new Date();
        trackDist = stations.find(s => s.number === Number(curStation)).distance;
        return console.log(`train ${number} on track after station ${curStation}`);
      }
      const waitSec = (now - startWaitTime) / 1000;
      return console.log(`train ${number} waiting ${waitSec} seconds at station ${curStation}`);
    }
    if (status === trainStatus.ONTRACK) {
      const travelM = calcDist(beginMoveTime, speed);
      if (travelM < trackDist) {
        return console.log(`train ${number} travels ${travelM} after station ${curStation}`);
      }
      const arriveStation = (Number(curStation) + 1) % STATION_NUM;
      console.log(`train ${number} arrived at ${arriveStation}`);
      status = trainStatus.UNLOADING;
      mq.trackInUse[curStation] = false;
      beginUnloadTime = new Date();
      endUnloadTime = new Date(beginUnloadTime);
      endUnloadTime.setSeconds(beginUnloadTime.getSeconds() + UNLOADINGTIME);
      curStation = String(arriveStation);
      return console.log(`train ${number} unload at ${arriveStation}`);
    }
    if (status === trainStatus.UNLOADING) {
      if (now < endUnloadTime) {
        return console.log(`train ${number} unload at ${curStation}`);
      }
      status = trainStatus.LOADING;
      startLoadTime = new Date();
      endLoadTime = new Date(startLoadTime);
      endLoadTime.setSeconds(startLoadTime.getSeconds() + LOADINGTIME);
      return console.log(`train ${number} load at ${curStation}`);
    }
  }, POLL_INTERVAL)
};
// Run the program
controllerProcess();
trainData.trains.forEach(d => trainProcess(d, MQ));
