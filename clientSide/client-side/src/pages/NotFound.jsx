import React from "react";
import { Link } from "react-router-dom";
import { HiOutlineExclamationCircle } from "react-icons/hi";
import Header from "components/Header";
import Footer from "components/Footer";
import { Heading, Text } from "components";

const NotFound = () => {
  return (
    <div className="flex flex-col min-h-screen bg-white-A700 dark:bg-gray-900">
      <Header className="flex flex-row justify-between items-center w-full p-6 sm:p-5 bg-white-A700" />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center px-5 py-24">
        <HiOutlineExclamationCircle className="text-6xl text-primary-500" />
        <Heading as="h1" size="s">
          Page not found
        </Heading>
        <Text as="p" className="max-w-md">
          The page you're looking for doesn't exist or may have been moved.
        </Text>
        <Link
          to="/"
          className="mt-4 inline-flex items-center justify-center bg-primary-600 hover:bg-primary-700 text-white-A700 font-medium rounded-lg text-sm px-6 py-2.5 transition-colors"
        >
          Back to Home
        </Link>
      </div>
      <Footer className="flex justify-center items-center w-full mt-[85px] p-[30px] sm:p-5 bg-gray-800" />
    </div>
  );
};

export default NotFound;
