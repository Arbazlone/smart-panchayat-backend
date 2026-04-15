const axios = require('axios');

const sendOTP = async (phone, otp) => {
    try {
        if (process.env.NODE_ENV === 'production' && process.env.FAST2SMS_API_KEY) {
            const response = await axios({
                method: 'post',
                url: 'https://www.fast2sms.com/dev/bulkV2',
                headers: {
                    'authorization': process.env.FAST2SMS_API_KEY,
                    'Content-Type': 'application/json'
                },
                data: {
                    route: 'otp',
                    variables_values: otp,
                    numbers: phone,
                    flash: 0,
                    message: 'Your Smart Panchayat OTP is: ' + otp,
                    sender_id: 'FSTSMS'  // Add sender ID
                }
            });
            
            console.log('📱 SMS sent successfully:', response.data);
            return response.data.return === true;
            
        } else {
            console.log(`📱 [DEV] OTP for ${phone}: ${otp}`);
            return true;
        }
        
    } catch (error) {
        // Log detailed error
        console.error('❌ Fast2SMS Error:', error.response?.data || error.message);
        
        // Fallback for development
        if (process.env.NODE_ENV !== 'production') {
            console.log(`📱 [DEV] OTP for ${phone}: ${otp}`);
            return true;
        }
        return false;
    }
};

module.exports = { sendOTP };