import React from "react";
import { Text, Heading } from "components";
import { FiPhone } from "react-icons/fi";
import { MdOutlineEmail } from "react-icons/md";

export default function Footer({ className = "", ...props }) {
  return (
    <footer {...props} className={className}>
      <div className="flex flex-col items-center justify-center w-[88%] mt-[31px] gap-8 mx-[113px] md:mx-5">
        <div className="flex flex-col items-start justify-start w-full max-w-md gap-4">
          <Heading size="xs" as="h4" className="!text-white-A700">
            POS system
          </Heading>
          <Text as="p" className="!font-normal leading-8">
            Fast, reliable point-of-sale for your store.
          </Text>
          <div className="flex flex-col items-start justify-start w-full gap-3">
            <div className="flex flex-row justify-start items-center w-full gap-2 py-0.5">
              <FiPhone className="text-[1.35rem] text-primary-400" />
              <Text as="p" className="!text-white-A700 !font-normal">
                +(92)3453084337
              </Text>
            </div>
            <div className="flex flex-row justify-start items-center w-full gap-2">
              <MdOutlineEmail className="text-[1.35rem] text-primary-400" />
              <Text as="p" className="mt-0.5 !text-white-A700 !font-normal">
                support@possystem.com
              </Text>
            </div>
          </div>
        </div>
        <Text size="xs" as="p" className="!text-blue_gray-100">
          POS system ©
        </Text>
      </div>
    </footer>
  );
}
