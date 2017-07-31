import contract from 'truffle-contract';
import lodash from 'lodash';
import moment from 'moment';

import React, { Component } from 'react';
import { Progress } from 'reactstrap';
import { Dialog, FlatButton } from 'material-ui'
import { Card, CardHeader } from 'material-ui/Card';
import LinearProgress from 'material-ui/LinearProgress';
import Avatar from 'material-ui/Avatar';
import Chip from 'material-ui/Chip';
import * as MColors from 'material-ui/styles/colors';
import ImagePhotoCamera from 'material-ui/svg-icons/image/photo-camera';
import CircularProgress from 'material-ui/CircularProgress';

import BetController from './BetController';

import BetJson from 'build/contracts/Bet.json';
import GovernanceInterfaceJson from 'build/contracts/GovernanceInterface.json';
import getWeb3 from 'utils/getWeb3';
import stateTransitionFunctions from 'utils/stateTransitions';
import betFields from './betFields';
import {betTimeStates, betState, stepperState} from 'utils/betStates';
import Timer from './Timer';
import Arbiters from './Arbiters';


import BigNumber from 'bignumber.js';
const MOCK = false;
const mockDateBegin = new BigNumber(moment().unix() + 5);
const mockDateEnd = new BigNumber(moment().unix() + 10);
const mockResolverDeadline = new BigNumber(moment().unix() + 25);
const mockTerminateDeadline = new BigNumber(moment().unix() + 30);

class Bet extends Component {
  constructor(props) {
    super(props);
    this.state = {
      currentBetState: 0, // Overall current bet state (from time and contract state)
      betShoudlBeAtState: 0, // Related to time
      stepperState: 0,
      hasBetOnTeam: {team: null, value: new BigNumber(0)}, // {team: false/true/null, value: amount}
      open: false,
      betHappened: false,
      betStatusMessage: '',
      transactionInProcess: false,
      isExpanded: false,
      loadCompleted: false,
      cat_url: null,
      isArbiter: false,
      stepIndex: 0,
      ...betFields,
      web3: null, // TODO: REMOVE WEB3, DO STATIC
    }
  }

  LinearProgressCustom = () => {
    if (this.state.transactionInProcess)
      return <LinearProgress mode="indeterminate" />;
    return null;
  };

  updateStateFromTimer(newState) {
    if (newState === betTimeStates.matchOpen) {
      if (this.state.currentBetState !== betState.matchOpen)
        this.setState({
          currentBetState: betState.matchOpen,
          stepperState: stepperState.matchOpen
        });
    }
    else if (newState === betTimeStates.matchRunning) {
      if (this.state.currentBetState <= betState.matchRunning)
        this.setState({
          currentBetState: betState.matchRunning,
          stepperState: stepperState.matchRunning
        });
    }
    else if (newState === betTimeStates.matchEnded) {
      if ((this.state.currentBetState !== betState.calledArbiter) &&
          (this.state.currentBetState !== betState.draw) &&
          (this.state.currentBetState !== betState.team0Won) &&
          (this.state.currentBetState !== betState.team1Won) &&
          (this.state.currentBetState !== betState.arbiterUndecided) &&
          (this.state.currentBetState !== betState.shouldCallArbiter))
        this.setState({
          currentBetState: betState.shouldCallArbiter,
          stepperState: stepperState.matchEnded
        });
    }
    else if (newState === betTimeStates.matchExpired) {
      if ((this.state.currentBetState !== betState.draw) &&
          (this.state.currentBetState !== betState.team0Won) &&
          (this.state.currentBetState !== betState.team1Won) &&
          (this.state.currentBetState !== betState.arbiterUndecided) &&
          (this.state.currentBetState !== betState.betExpired))
      this.setState({
        currentBetState: betState.betExpired,
        stepperState: stepperState.matchEnded
      });
    }
    else if (newState === betTimeStates.matchDestruct) {
      if ((this.state.currentBetState !== betState.draw) &&
          (this.state.currentBetState !== betState.team0Won) &&
          (this.state.currentBetState !== betState.team1Won) &&
          (this.state.currentBetState !== betState.betTerminate))
      this.setState({
        currentBetState: betState.betTerminate,
        stepperState: stepperState.matchEnded
      });
    }
  }

  handleCloseDialog = () => {
    this.setState({betHappened: false});
  };

  BetStatusDialog = () => {
    const actions = [
      <FlatButton
        label="Ok"
        primary={true}
        keyboardFocused={true}
        onTouchTap={this.handleCloseDialog}
      />
    ];

    return (
      <Dialog
        title="Bet status"
        actions={actions}
        modal={false}
        open={this.state.betHappened}
        onRequestClose={this.handleCloseDialog}
      >
      {this.state.betStatusMessage}
      </Dialog>
    )
  }

  transactionHappened = betPromisse => {
    var err = null;
    this.setState({ transactionInProcess: true });
    return betPromisse.then(tx => {
      return this.setState({
        betStatusMessage: `Transaction OK
        \n\nTransaction hash: ${tx.tx}
        \n\nAppended in block: ${tx.receipt.blockNumber}\n`
      });
    })
    .catch(_err => {
      err = _err;
      this.setState({betStatusMessage: `Transaction FAILED\n\nCause: ${err.toString()}`});
    })
    .then(() => {
      this.setState({betHappened: true});
      this.setState({transactionInProcess: false});
      if (err !== null)
        throw err;
    });
  };

  /* Begin
   * Functions to interact with contract
   */
  betOnTeam = (teamToBet, value) => {
    if (this.state.betContractInstance === undefined ||
        teamToBet === undefined ||
        value === undefined ||
        value <= 0) {
      console.error('Error');
      return;
    }
    const betPromisse = this.state.betContractInstance.bet(
      teamToBet,
      { from: this.state.web3.eth.accounts[0],
        value: value
      });
    this.transactionHappened(betPromisse);
  };
  callArbiter = () => {
    const callArbiterPromise = this.state.betContractInstance.updateResult(
      { from: this.state.web3.eth.accounts[0]
      });
    this.transactionHappened(callArbiterPromise);
  };
  callVote = (onTeam) => {
    const callVotePromise = this.state.arbiterContractInstance.castVote(
      this.props.address, onTeam,
      { from: this.state.web3.eth.accounts[0],
      });
    this.transactionHappened(callVotePromise);
  }
  withdraw = () => {
    const withdrawPromise = this.state.betContractInstance.withdraw(
    { from: this.state.web3.eth.accounts[0],
    });
    this.transactionHappened(withdrawPromise)
    .then(() => {
      this.setState({
        hasBetOnTeam : {
          team : null,
          amount : new BigNumber(0),
          stepperState: stepperState.matchDecision
        }
      });
    })
    .catch(() => {
    })
  }
  // End of contract interaction functions

  FilteredBet = () => {
    const betTitle = 
      <div className='inRows'>
        <div className='pushLeft'>
          <Chip backgroundColor={MColors.cyan500} labelColor={MColors.white}>
            <Avatar size={32} backgroundColor={MColors.cyan800}>Ξ</Avatar>
            {this.state.team0BetSum.toString()}
          </Chip>
          <Chip backgroundColor={MColors.white}>
            {this.state.team0Name} vs {this.state.team1Name}
          </Chip>
          <Chip backgroundColor={MColors.cyan500} labelColor={MColors.white}>
            <Avatar size={32} backgroundColor={MColors.cyan800}>Ξ</Avatar>
            {this.state.team1BetSum.toString()}
          </Chip>
        </div> 
        <Timer parentState={this.state.currentBetState}
               updateState={this.updateStateFromTimer.bind(this)}
               beginDate={(MOCK) ? mockDateBegin : this.state.timestampMatchBegin}
               endDate={(MOCK) ? mockDateEnd : this.state.timestampMatchEnd}
               resolverDeadline={(MOCK) ? mockResolverDeadline : this.state.timestampArbiterDeadline}
               terminateDeadline={(MOCK) ? mockTerminateDeadline : this.state.timestampSelfDestructDeadline}
        />
      </div>;
      // My bets
      if ((this.props.category  === 'my_bets' && this.state.hasBetOnTeam.team !== null) ||
        // This category
        (this.props.category === this.state.category && this.state.isFeatured) ||
        // All the bets
        (this.props.category === 'all_bets' && this.state.isFeatured) ||
        // Unfeatured and unfeatured category
        (this.props.category === 'unfeatured' && !this.state.isFeatured))
        return (
          <Card
            // FIXME: when corrected https://github.com/callemall/material-ui/issues/7411
            onExpandChange={lodash.debounce(this.onExpand, 150)}
            expanded={this.state.isExpanded}
          >
          <CardHeader
            avatar={(this.state.cat_url != null) ? this.state.cat_url : <Avatar icon={<ImagePhotoCamera />} /> }
            title={betTitle}
            actAsExpander={true}
            showExpandableButton={true}
          />
          <BetController
            currentBetState={this.state.currentBetState}
            team0Name={this.state.team0Name}
            team1Name={this.state.team1Name}
            stepperState={this.state.stepperState}
            isExpanded={this.state.isExpanded}
            hasBetOnTeam={this.state.hasBetOnTeam}
            team0BetSum={this.state.team0BetSum}
            team1BetSum={this.state.team1BetSum}
            tax={this.state.TAX}
            betOnTeamFunction={this.betOnTeam.bind(this)}
            callArbiterFunction={this.callArbiter.bind(this)}
            callVoteFunction={this.callVote.bind(this)}
            withdrawFunction={this.withdraw.bind(this)}
            betHappened={this.state.betHappened}
            isArbiter={this.state.isArbiter}
            arbiterInfo={this.state.arbiterInfo}
          />
          <this.BetStatusDialog />
          <this.LinearProgressCustom mode="indeterminate" />
          </Card>
        );
      return null;
    }
    
  onExpand = () => {
    // NOTE: Don't reference this.state in this.setState
    this.setState(previousState => ({isExpanded: !previousState.isExpanded}));
  }

  componentWillMount() {
    getWeb3
    .then(results => {
      this.setState({
        web3: results.web3
      });

      this.instantiateContract();
    })
    .catch(err => {
      console.error('Error finding web3', err);
    });
  }
        
  async instantiateContract() {
    var objs = {loadCompleted: true};
    async function setAttributes(attributeNames, contractInstance) {
      var promises = Object.keys(attributeNames).map(async (attr) => {
        if (attr in betFields
            && attr !== 'betsToTeam0' // Cannot get mapping keys, no prob: get from events
            && attr !== 'betsToTeam1') { // idem
          objs[attr] = await contractInstance[attr]()
        }
      });
      await Promise.all(promises);
      return objs;
    }

    const betContract = contract(BetJson);
    const arbiterContract = contract(GovernanceInterfaceJson);
    arbiterContract.setProvider(this.state.web3.currentProvider);
    betContract.setProvider(this.state.web3.currentProvider);

    var betContractInstance = betContract.at(this.props.address);
    const governanceAddress = await betContractInstance.arbiter();
    
    const arbiterContractInstance = arbiterContract.at(governanceAddress);
    const isArbiter = await arbiterContractInstance.isMember(this.state.web3.eth.accounts[0]);

    var stateObjects = await setAttributes(this.state, betContractInstance);
    stateObjects['cat_url'] = require('assets/imgs/' + stateObjects.category + '.png');
    
    const betsToTeam0 = await betContractInstance.betsToTeam0(this.state.web3.eth.accounts[0]);
    const betsToTeam1 = await betContractInstance.betsToTeam1(this.state.web3.eth.accounts[0]);
    
    const betToTeam = (betsToTeam0.greaterThan(new BigNumber(0))) ? false :
                      ((betsToTeam1.greaterThan(new BigNumber(0))) ? true : null);

    const newStates = stateTransitionFunctions.fromBetStateToCurrentState(
      stateObjects.betState.toNumber(), betToTeam);

    this.setState({
      ...stateObjects,
      hasBetOnTeam : {
        team : betToTeam,
        amount : (betToTeam === false) ? betsToTeam0 : 
                 (betToTeam === true) ? betsToTeam1 : new BigNumber(0)
      },
      currentBetState: newStates.newOverAllState,
      stepperState: newStates.newStepperState
    });

    this.setState({
      isArbiter: isArbiter,
      arbiterContractInstance: arbiterContractInstance,
      arbiterInfo: {
        name: await arbiterContractInstance.getName(),
        verified: Arbiters.isVerifiedArbiter(arbiterContractInstance.address)
      },
      betContractInstance: betContractInstance
    });
    var allBetEvents = betContractInstance.allEvents({
      fromBlock: 'latest',
      toBlock: 'latest'
    });
    
    allBetEvents.watch((error, response) => {
      if (response.event === 'NewBet') {
        if (response.args.forTeam === false)
          this.setState(previousState => (
            { team0BetSum : previousState.team0BetSum.plus(response.args.amount)}));
        else
         this.setState(previousState => (
            { team1BetSum : previousState.team1BetSum.plus(response.args.amount)}));

        if (response.args.from === this.state.web3.eth.accounts[0]) {
          this.setState(previousState => {
            if (previousState.hasBetOnTeam.team === null)
              previousState.hasBetOnTeam.team = {
                team: response.args.forTeam,
                amount: response.args.amount
              };
            else
              previousState.hasBetOnTeam = {
                team: response.args.forTeam,
                amount: previousState.hasBetOnTeam.amount.add(response.args.amount)
              }
          });
        }
      }
      else if (response.event === 'StateChanged') {
        const responseState = response.args.state.toNumber();
        var newStates = stateTransitionFunctions.fromBetStateToCurrentState(
          responseState, this.state.hasBetOnTeam);
        this.setState({
          currentBetState: newStates.newOverAllState,
          stepperState: newStates.newStepperState
        });
      }
    });
    if (MOCK) {
      setTimeout(() => {this.setState(() => {
        return {
          currentBetState: betState.calledArbiter,
        stepperState: stepperState.matchEnded
      }})}, 15000);
      setTimeout(() => {this.setState(() => {
      var shouldPay = stepperState.matchDecision;
      if (this.state.hasBetOnTeam.team !== null)
        shouldPay = stepperState.payout;
      return {
        currentBetState: betState.team0Won,
        stepperState: shouldPay
    }})}, 20000);
    }
  }
  render() {
  if (!this.state.loadCompleted)
    return ( <div className="center"> <CircularProgress /> </div> ) ;

    var total = this.state.team0BetSum + this.state.team1BetSum;
    var percentage0 = (this.state.team0BetSum / total)*100;
    var percentage1 = (this.state.team1BetSum / total)*100;
    isNaN(percentage0) ? percentage0 = 0 : percentage0 = parseFloat(percentage0).toFixed(2);
    isNaN(percentage1) ? percentage1 = 0 : percentage1 = parseFloat(percentage1).toFixed(2);

   var ProgressBar = () => {
      if (percentage0 !== 0 && percentage1 !== 0)
        return <Progress multi className='progressBar'>
          <Progress bar color="danger" value={percentage0}>{percentage0}%</Progress>
          <Progress bar color="success" value={percentage1}>{percentage1}%</Progress>
          </Progress>;
      else
        return null;
    }

    return <this.FilteredBet />
  }
}

export default Bet;
