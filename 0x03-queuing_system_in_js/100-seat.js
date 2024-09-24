import express from 'express';
import kue from 'kue';
import redis from 'redis';
import { promisify } from 'util';

// Create Redis client
const client = redis.createClient();
const getAsync = promisify(client.get).bind(client);

// Initialize seats and reservation status
const totalSeats = 50;
client.set('available_seats', totalSeats);
let reservationEnabled = true;

// Create Kue queue
const queue = kue.createQueue();

// Create an Express server
const app = express();
const port = 1245;

// Function to reserve seats
const reserveSeat = (number) => {
    client.set('available_seats', number);
};

// Function to get the current number of available seats
const getCurrentAvailableSeats = async () => {
    const seats = await getAsync('available_seats');
    return parseInt(seats, 10);
};

// Route to get the number of available seats
app.get('/available_seats', async (req, res) => {
    const numberOfAvailableSeats = await getCurrentAvailableSeats();
    res.json({ numberOfAvailableSeats });
});

// Route to reserve a seat
app.get('/reserve_seat', (req, res) => {
    if (!reservationEnabled) {
        return res.json({ status: 'Reservations are blocked' });
    }

    const job = queue.create('reserve_seat').save((err) => {
        if (err) {
            return res.json({ status: 'Reservation failed' });
        }
        res.json({ status: 'Reservation in process' });
    });

    job.on('complete', () => {
        console.log(`Seat reservation job ${job.id} completed`);
    });

    job.on('failed', (errorMessage) => {
        console.log(`Seat reservation job ${job.id} failed: ${errorMessage}`);
    });
});

// Route to process the queue
app.get('/process', (req, res) => {
    res.json({ status: 'Queue processing' });

    queue.process('reserve_seat', async (job, done) => {
        const availableSeats = await getCurrentAvailableSeats();
        if (availableSeats <= 0) {
            reservationEnabled = false;
            return done(new Error('Not enough seats available'));
        }

        reserveSeat(availableSeats - 1);
        if (availableSeats - 1 === 0) {
            reservationEnabled = false;
        }
        done();
    });
});

// Start the server
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});